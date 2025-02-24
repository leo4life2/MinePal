import axios from 'axios';
import { HTTPS_BACKEND_URL } from '../constants.js';
const minepal_response_schema = {
    type: "object",
    properties: {
        chat_response: { type: "string" },
        execute_command: { type: "string" }
    },
    required: ["chat_response", "execute_command"],
    additionalProperties: false
};
export class Proxy {
    async sendRequest(turns, systemMessage, stop_seq='***', memSaving=false) {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        let res = null;
        // console.log("=== BEGIN MESSAGES ===");
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

            const response = await axios.post(`${HTTPS_BACKEND_URL}/openai/chat`, requestBody);
            res = response.data;
        } catch (err) {
            console.error("Request failed:", err);
            res = "My brain disconnected.";
            // if ((err.message.includes('Context length exceeded') || err.response?.status === 500) && turns.length > 1) {
            //     return await this.sendRequest(turns.slice(1), systemMessage, stop_seq, memSaving);
            // } else {
            //     res = 'My brain disconnected, try again.';
            // }
        }
        return res;
    }

    async embed(text, maxRetries = 3, initialDelay = 10) {
        let retryCount = 0;
        
        while (true) {
            try {
                const response = await axios.post(`${HTTPS_BACKEND_URL}/openai/embed`, {
                    model_name: 'text-embedding-3-small',
                    text: text,
                });
                return response.data;
            } catch (err) {
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