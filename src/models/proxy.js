import axios from 'axios';
import { HTTPS_BACKEND_URL } from '../constants.js';
import fs from 'fs';
import path from 'path';

const minepal_response_schema = {
    type: "object",
    properties: {
        thought: { 
            type: "string",
            description: "Internal reasoning explaining your planned action and next steps concisely."
        },
        current_goal_status: {
            type: "string",
            description: "Your current goal and its status (In Progress, Completed, Failed, etc.). Formatted as 'Goal: <goal_description> (Status: <status>)'"
        },
        say_in_game: { 
            type: "string",
            description: "Short, casual in-game message directed at players in owner's specified language."
        },
        execute_command: { 
            type: "string",
            description: "A single MinePal non-memory command (!command) or Minecraft slash-command to execute. Do not make memory related actions here. Do not make multiple commands calls. Always prioritize MinePal custom commands and use slash commands sparingly or only if user asks for it. Leave empty if no command is necessary."
        },
        requires_more_actions: {
            type: "boolean",
            description: "Set to true if you need to continue executing commands to complete your goal. False if your current goal is complete and you can halt."
        },
        manage_memories: {
            type: "array",
            items: { 
                type: "string",
                description: "An operation string: 'ADD:<text>', 'DELETE:<shortId>' (e.g., 'DELETE:MEM-123'), or 'UPDATE:<shortId>:<newText>' (e.g., 'UPDATE:MEM-123:Updated memory text')."
            },
            description: "An array of memory operations. Use ADD:<text> to add new memories. Use DELETE:<shortId> to remove obsolete memories. Use UPDATE:<shortId>:<newText> to modify existing memories."
        }

    },
    required: ["thought", "say_in_game", "execute_command", "requires_more_actions", "current_goal_status", "manage_memories"],
    additionalProperties: false
};

export class Proxy {
    constructor(userDataDir, openai_api_key = null) {
        this.userDataDir = userDataDir;
        this.openai_api_key = openai_api_key;
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
        let messages = [{'role': 'system', 'content': systemMessage}].concat(
            turns.map(turn => {
                // If assistant, format all fields into content
                if (turn.role === 'assistant') {
                    let formattedContent = '';
                    if (turn.thought) {
                        formattedContent += `[Inner Thought]: ${turn.thought}\n`;
                    }
                    if (turn.current_goal_status) {
                        formattedContent += `[Goal Status]: ${turn.current_goal_status}\n`;
                    }
                    // Add any other fields you want to expose here
                    formattedContent += turn.content || '';
                    return { ...turn, content: formattedContent };
                }
                // For all other roles, just pass through
                return turn;
            })
        );
        let res = null;
        // console.log("\n\n=== BEGIN MESSAGES === \n\n");
        // messages.forEach((msg, index) => {
        //     console.log(`Message ${index + 1}:`);
        //     console.log(`Role: ${msg.role}`);
        //     console.log(`Content: ${msg.content}`);
        //     console.log("---");
        // });
        // console.log("=== END MESSAGES ===");
        
        // Define base request body parts
        const baseRequestBody = {
            messages: messages
        };
        if (stop_seq && stop_seq !== '***') { // Only add stop if not default/empty
            baseRequestBody.stop = stop_seq; // OpenAI uses 'stop', backend uses 'stop_seq'
        }

        if (!memSaving) {
            baseRequestBody.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "minepal_response",
                    schema: minepal_response_schema,
                    strict: true
                }
            };
        }

        try {
            let response;
            if (this.openai_api_key) {
                // --- Direct OpenAI Request --- 
                const headers = {
                    'Authorization': `Bearer ${this.openai_api_key}`,
                    'Content-Type': 'application/json'
                };
                // Add model name required by OpenAI API
                const requestBody = {
                    ...baseRequestBody,
                    model: "gpt-4o-mini" // Hardcoding model for now, could be made configurable
                };
                
                response = await axios.post('https://api.openai.com/v1/chat/completions', requestBody, { headers });
                res = response.data.choices[0].message.content; // Extract content for OpenAI response

            } else {
                // --- Custom Backend Request ---                
                const headers = {};
                const token = await this.getJWT(); // Use JWT for custom backend
                if (token) {
                    headers.Authorization = `Bearer ${token}`;
                }
                // Adapt stop sequence key for backend
                const requestBody = { ...baseRequestBody };
                if (requestBody.stop) { // If stop was added for OpenAI
                     requestBody.stop_seq = requestBody.stop;
                     delete requestBody.stop;
                }

                response = await axios.post(`${HTTPS_BACKEND_URL}/openai/chat`, requestBody, { headers });
                res = response.data; // Custom backend returns data directly
            }

        } catch (err) {
            // Initialize res within catch to avoid issues from prior attempts
            res = "Error: "; 
            if (err.response) {
                // Try to get a meaningful message from the response data
                let errorDetail = "Unknown server error";
                if (err.response.data) {
                    // OpenAI errors often have a structured message
                    if (typeof err.response.data.error === 'string') {
                        errorDetail = err.response.data.error;
                    } else if (typeof err.response.data.error?.message === 'string') {
                        errorDetail = err.response.data.error.message;
                    } else if (typeof err.response.data === 'string') {
                        errorDetail = err.response.data;
                    } else {
                        // Fallback if structure is unexpected, but still stringify
                        errorDetail = `Received complex error object: ${JSON.stringify(err.response.data)}`;
                    }
                }
                res += `Status ${err.response.status}: ${errorDetail}`;

            } else if (err.request) {
                 res += "Cannot reach the service. Check internet connection or API endpoint.";
            } else {
                 res += err.message || "An unexpected error occurred.";
            }
            // Log the actual error data from the response if available
            console.error("[Proxy Send Error] Status:", err.response?.status, "Response Data:", JSON.stringify(err.response?.data, null, 2), "Generated Error Msg:", res, "Raw Error:", err.message);
        }
        return res;
    }

    async embed(text, maxRetries = 3, initialDelay = 10) {
        let retryCount = 0;
        const modelName = 'text-embedding-3-small'; // Consistent model

        while (true) {
            try {
                let response;
                if (this.openai_api_key) {
                    // --- Direct OpenAI Embeddings Request ---
                    const headers = {
                        'Authorization': `Bearer ${this.openai_api_key}`,
                        'Content-Type': 'application/json'
                    };
                    const requestBody = {
                        model: modelName, // OpenAI uses 'model'
                        input: text,      // OpenAI uses 'input'
                    };
                    response = await axios.post('https://api.openai.com/v1/embeddings', requestBody, { headers });
                    return response.data.data[0].embedding; // Extract embedding for OpenAI response
                } else {
                    // --- Custom Backend Embeddings Request ---
                    const headers = {};
                    const token = await this.getJWT(); // Use JWT for custom backend
                    if (token) {
                        headers.Authorization = `Bearer ${token}`;
                    }
                    const requestBody = {
                        model_name: modelName, // Backend uses 'model_name'
                        text: text,          // Backend uses 'text'
                    };
                    response = await axios.post(`${HTTPS_BACKEND_URL}/openai/embed`, requestBody, { headers });
                    return response.data; // Custom backend returns data directly
                }
            } catch (err) {
                 // Specific handling for OpenAI 401/403 errors
                if (this.openai_api_key && err.response && (err.response.status === 401 || err.response.status === 403)) {
                    console.error(`[Proxy Embed Error] OpenAI API Key Error (${err.response.status}): ${err.response.data?.error?.message || 'Invalid Key or Permissions'}`);
                    throw new Error(`OpenAI API Key Error (${err.response.status})`); 
                }
                 // Specific handling for Backend 403 errors (assuming JWT based)
                if (!this.openai_api_key && err.response && err.response.status === 403) {
                    console.error(`[Proxy Embed Error] Access Forbidden: ${err.response.data?.error || 'Check JWT or backend permissions'}`);
                    throw new Error('Access forbidden: ' + (err.response.data?.error || 'Invalid JWT'));
                }
                
                retryCount++;
                if (retryCount > maxRetries) {
                    console.error(`[Proxy Embed Error] Failed after ${maxRetries} retries. Status: ${err.response?.status}, Data: ${JSON.stringify(err.response?.data)}, Message: ${err.message}`);
                    throw new Error(`Failed to get embedding after ${maxRetries} retries`);
                }

                const delay = initialDelay * Math.pow(2, retryCount - 1);
                console.log(`[Proxy Embed] Retry attempt ${retryCount}/${maxRetries} after ${delay}ms delay... (Status: ${err.response?.status})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}