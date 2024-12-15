import axios from 'axios';
const minepal_response_schema = {
    type: "object",
    properties: {
        chat_response: { type: "string" },
        execute_command: { type: "string" }
    },
    required: ["chat_response", "execute_command"],
    additionalProperties: false
};
export class GPT {
    constructor(model_name, openai_api_key) {
        this.model_name = model_name;
        this.openai_api_key = openai_api_key;
        console.log(`Using model: ${model_name}`);
    }

    async sendRequest(turns, systemMessage, stop_seq='***', memSaving=false) {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        let res = null;

        const maxRetries = 5;
        let attempt = 0;
        let response;

        try {
            const requestBody = {
                model: this.model_name || "gpt-4o-mini",
                messages: messages,
                stop: stop_seq,
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

            while (attempt < maxRetries) {
                try {
                    response = await axios.post('https://api.openai.com/v1/chat/completions', 
                        requestBody,
                        {
                            headers: {
                                'Authorization': `Bearer ${this.openai_api_key}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 2000
                        }
                    );
                    res = response.data.choices[0].message.content;
                    break; // Exit loop if request is successful
                } catch (err) {
                    attempt++;
                    if (err.response) {
                        // Log the server's error message
                        console.error("Error response from server:", err.response.data);
                    } else {
                        console.error("Error:", err.message);
                    }
                    if (attempt >= maxRetries) {
                        console.error("All retries failed:", err);
                        res = "Connection to OpenAI service timed out.";
                        break;
                    }
                }
            }
        } catch (err) {
            console.error("Request failed:", err);
            res = "My brain disconnected.";
        }
        return res;
    }

    async embed(text) {
        try {
            const response = await axios.post('https://api.openai.com/v1/embeddings', {
                model: 'text-embedding-ada-002',
                input: text,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openai_api_key}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data.data[0].embedding;
        } catch (err) {
            if (err.response && err.response.status === 500) {
                console.log('Error 500:', err.response.data);
            } else {
                console.log('Error:', err.message);
            }
            throw new Error('Failed to get embedding');
        }
    }
}