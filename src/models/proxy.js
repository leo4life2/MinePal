import axios from 'axios';
import { HTTPS_BACKEND_URL } from '../constants.js';
import fs from 'fs';
import path from 'path';
import util from 'util';

const minepal_response_schema = {
    type: "object",
    properties: {
        thought: { type: "string" },
        say_in_game: { type: "string" },
        execute_command: { type: "string" }
    },
    required: ["thought", "say_in_game", "execute_command"],
    additionalProperties: false
};

export class Proxy {
    constructor(userDataDir) {
        this.userDataDir = userDataDir;
    }

    // Get the latest JWT from file
    async getJWT() {
        try {
            const tokenPath = path.join(this.userDataDir, 'supa-jwt.json');
            if (fs.existsSync(tokenPath)) {
                const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
                return data.token;
            }
        } catch (err) {
            console.error("Error reading JWT:", err);
        }
        return null;
    }

    async sendRequest(turns, systemMessage, stop_seq='***', memSaving=false) {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        let res = null;

        // console.log("\n\n=== BEGIN MESSAGES === \n\n");
        // messages.forEach((msg, index) => {
        //     console.log(`Message ${index + 1}:`);
        //     console.log(`Role: ${msg.role}`);
        //     console.log(`Content: ${msg.content}`);
        //     console.log("---");
        // });
        // console.log("=== END MESSAGES ===");

        try {
            const requestBody = {
                model_name: this.model_name,
                messages: messages,
                stop_seq: stop_seq,
            };

            if (!memSaving) {
                requestBody.response_format = {
                    type: "json_schema",
                    json_schema: {
                        name: "minepal_response",
                        schema: minepal_response_schema,
                        strict: true
                    }
                };
            }

            // Get JWT for authorization
            const token = await this.getJWT();
            const headers = {};
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await axios.post(`${HTTPS_BACKEND_URL}/openai/chat`, requestBody, { headers });
            res = response.data;
            console.log('[THOUGHT] thought was: ', res.thought);
        } catch (err) {
            res = "Error: ";
            if (err.response) {
                res += `${err.response.data.error}`;
            } else {
                res += "Cannot reach the internet, my brain disconnected.";
            }
        }
        return res;
    }

    async embed(text, maxRetries = 3, initialDelay = 10) {
        let retryCount = 0;
        
        while (true) {
            try {
                // Get JWT for authorization
                const token = await this.getJWT();
                const headers = {};
                if (token) {
                    headers.Authorization = `Bearer ${token}`;
                }

                const response = await axios.post(`${HTTPS_BACKEND_URL}/openai/embed`, {
                    model_name: 'text-embedding-3-small',
                    text: text,
                }, { headers });
                return response.data;
            } catch (err) {
                if (err.response && err.response.status === 403) {
                    throw new Error('Access forbidden: ' + err.response.data.error);
                }
                retryCount++;
                
                if (retryCount > maxRetries) {
                    if (err.response && err.response.status === 500) {
                        console.log('proxy embed Error 500:', err.response.data);
                    } else {
                        console.log('proxy embed Error:', err.message);
                    }
                    throw new Error(`Failed to get embedding after ${maxRetries} retries`);
                }

                const delay = initialDelay * Math.pow(2, retryCount - 1);
                console.log(`Retry attempt ${retryCount}/${maxRetries} after ${delay}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}