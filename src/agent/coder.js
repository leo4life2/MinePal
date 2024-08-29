import { writeFile, readFile, mkdirSync } from 'fs';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.file_counter = 0;
        this.fp = `${this.agent.userDataDir}/bots/${agent.name}/action-code/`;
        this._executing = false; // Private variable to hold the state
        this.executingQueue = []; // Queue to hold executing promises
        this.generating = false;
        this.code_template = '';
        this.timedout = false;
        readFile(`${this.agent.appPath}/bots/template.js`, 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync(this.fp, { recursive: true });
    }

    get executing() {
        return this._executing;
    }

    set executing(value) {
        this._executing = value;
        if (!value && this.executingQueue.length > 0) {
            const { resolve, id, timeout } = this.executingQueue.shift();
            console.log(`Resolving executingPromise with ID: ${id}`);
            clearTimeout(timeout);
            resolve();
        }
    }

    // write custom code to file and import it
    async stageCode(code) {
        code = this.sanitizeCode(code);
        let src = '';
        code = code.replaceAll('console.log(', 'log(bot,');
        code = code.replaceAll('log("', 'log(bot,"');

        console.log(`Generated code: """${code}"""`);

        // this may cause problems in callback functions
        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (let line of code.split('\n')) {
            src += `    ${line}\n`;
        }
        src = this.code_template.replace('/* CODE HERE */', src);

        let filename = this.file_counter + '.js';
        // if (this.file_counter > 0) {
        //     let prev_filename = this.fp + (this.file_counter-1) + '.js';
        //     unlink(prev_filename, (err) => {
        //         console.log("deleted file " + prev_filename);
        //         if (err) console.error(err);
        //     });
        // } commented for now, useful to keep files for debugging
        this.file_counter++;

        let write_result = await this.writeFilePromise('.' + this.fp + filename, src)
        
        if (write_result) {
            console.error('Error writing code execution file: ' + result);
            return null;
        }
        return await import('../..' + this.fp + filename);
    }

    sanitizeCode(code) {
        code = code.trim();
        const remove_strs = ['Javascript', 'javascript', 'js']
        for (let r of remove_strs) {
            if (code.startsWith(r)) {
                code = code.slice(r.length);
                return code;
            }
        }
        return code;
    }

    writeFilePromise(filename, src) {
        // makes it so we can await this function
        return new Promise((resolve, reject) => {
            writeFile(filename, src, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async generateCode(agent_history) {
        // wrapper to prevent overlapping code generation loops
        console.log("[CODERSTOP] Generate code.");
        await this.stop();
        this.generating = true;
        let res = await this.generateCodeLoop(agent_history);
        this.generating = false;
        if (!res.interrupted) this.agent.bot.emit('idle');
        return res.message;
    }

    async generateCodeLoop(agent_history) {
        let messages = agent_history.getHistory();
        messages.push({role: 'system', content: 'Code generation started. Write code in codeblock in your response:'});

        let code_return = null;
        let failures = 0;
        const interrupt_return = {success: true, message: null, interrupted: true, timedout: false};
        for (let i=0; i<5; i++) {
            if (this.agent.bot.interrupt_code)
                return interrupt_return;
            console.log(messages)
            let res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
            if (this.agent.bot.interrupt_code)
                return interrupt_return;
            let contains_code = res.indexOf('```') !== -1;
            if (!contains_code) {
                if (res.indexOf('!newAction') !== -1) {
                    messages.push({
                        role: 'assistant', 
                        content: res.substring(0, res.indexOf('!newAction'))
                    });
                    continue; // using newaction will continue the loop
                }

                if (code_return) {
                    agent_history.add('system', code_return.message);
                    agent_history.add(this.agent.name, res);
                    this.agent.bot.chat(res);
                    return {success: true, message: null, interrupted: false, timedout: false};
                }
                if (failures >= 1) {
                    return {success: false, message: 'Action failed, agent would not write code.', interrupted: false, timedout: false};
                }
                messages.push({
                    role: 'system', 
                    content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'}
                );
                failures++;
                continue;
            }
            let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));

            const execution_file = await this.stageCode(code);
            if (!execution_file) {
                agent_history.add('system', 'Failed to stage code, something is wrong.');
                return {success: false, message: null, interrupted: false, timedout: false};
            }
            code_return = await this.execute(async ()=>{
                return await execution_file.main(this.agent.bot);
            }, this.agent.settings.code_timeout_mins);

            if (code_return.interrupted && !code_return.timedout)
                return {success: false, message: null, interrupted: true, timedout: false};
            console.log("Code generation result:", code_return.success, code_return.message);

            messages.push({
                role: 'assistant',
                content: res
            });
            messages.push({
                role: 'system',
                content: code_return.message
            });
        }
        return {success: false, message: null, interrupted: false, timedout: true};
    }

    async executeResume(func=null, name=null, timeout=10) {
        if (func != null) {
            this.resume_func = func;
            this.resume_name = name;
        }
        if (this.resume_func != null && this.agent.isIdle()) {
            console.log('resuming code...')
            this.interruptible = true;
            let res = await this.execute(this.resume_func, timeout);
            this.interruptible = false;
            this.resume_func = null; // Clear the resume function after execution
            return res;
        } else {
            return {success: false, message: null, interrupted: false, timedout: false};
        }
    }

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    // returns {success: bool, message: string, interrupted: bool, timedout: false}
    async execute(func, timeout=10) {
        if (!this.code_template) return {success: false, message: "Code template not loaded.", interrupted: false, timedout: false};

        let TIMEOUT;
        try {
            console.log('[CODERSTOP] executing code...\n');
            await this.stop();
            this.clear();

            this.executing = true;
            if (timeout > 0)
                TIMEOUT = this._startTimeout(timeout);
            await func(); // open fire
            this.executing = false;
            clearTimeout(TIMEOUT);

            let output = this.formatOutput(this.agent.bot);
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.clear();
            if (!interrupted && !this.generating) this.agent.bot.emit('idle');
            return {success:true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            console.log('Executing set to false in catch');
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error(`Process ${process.pid}: Code execution triggered catch: ${err}`);
            console.log("[CODERSTOP] Execute catch.");
            await this.stop();

            let message = this.formatOutput(this.agent.bot) + '!!Code threw exception!!  Error: ' + err + '\nStack trace:\n' + err.stack;
            let interrupted = this.agent.bot.interrupt_code;
            this.clear();
            if (!interrupted && !this.generating) this.agent.bot.emit('idle');
            return {success: false, message, interrupted, timedout: false};
        }
    }

    formatOutput(bot) {
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Code output is very long (${output.length} chars) and has been shortened.\n
                First outputs:\n${output.substring(0, MAX_OUT/2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT/2)}`;
        }
        else {
            output = 'Code output:\n' + output;
        }
        return output;
    }

    async stop() {
        if (!this.executing) return;
        this.agent.bot.interrupt_code = true;
        this.agent.bot.collectBlock.cancelTask();
        this.agent.bot.pathfinder.stop();
        this.agent.bot.pvp.stop();
        console.log('waiting for code to finish executing...');

        await new Promise((resolve, reject) => {
            const promiseId = Date.now(); // Use timestamp as a unique ID
            const timeout = setTimeout(() => {
                if (this.executing) {
                    console.log(`[CLEANKILL] Code execution refused to stop after 20 seconds. Promise ID: ${promiseId}`);
                    this.agent.cleanKill('Code execution refused to stop after 20 seconds. Killing process.');
                    reject(new Error('Code execution timeout'));
                }
            }, 20 * 1000); // 20 seconds timeout

            this.executingQueue.push({ resolve, reject, id: promiseId, timeout });
            console.log(`Creating executingPromise with ID: ${promiseId}`);
        });
    }

    clear() {
        this.agent.bot.output = '';
        this.agent.bot.interrupt_code = false;
        this.timedout = false;
    }

    _startTimeout(TIMEOUT_MINS=10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            console.log("[CODERSTOP] Timeout.");
            await this.stop(); // last attempt to stop
        }, TIMEOUT_MINS*60*1000);
    }
}