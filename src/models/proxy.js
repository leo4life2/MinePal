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
            type: "object",
            description: "An object detailing your current goal, overall status, and subtasks. The goal is complete only when all subtasks are marked complete.",
            properties: {
                title: {
                    type: "string",
                    description: "Brief description of the overall goal."
                },
                status: {
                    type: "string",
                    description: "Overall goal status (In Progress, Completed, Failed). Set to Completed only when all subtasks are complete."
                },
                subtasks: {
                    type: "array",
                    description: "List of specific subtasks required to achieve the goal. Each subtask should be achievable with a single action.",
                    items: {
                        type: "object",
                        properties: {
                            description: {
                                type: "string",
                                description: "Concise description of a single-action subtask."
                            },
                            status: {
                                type: "string",
                                description: "Status of the subtask (In Progress, Completed, Failed). Be diligent in updating status after each action."
                            }
                        },
                        required: ["description", "status"],
                        additionalProperties: false
                    }
                }
            },
            required: ["title", "status", "subtasks"],
            additionalProperties: false
        },
        say_in_game: { 
            type: "string",
            description: "Short, casual in-game message directed at players in owner's specified language."
        },
        emote: {
            type: "string",
            description: "Optional: Trigger a specific visual emote. Valid values: hello, wave, bow, yes, no, twerk, spin, pogo, cheer. Leave empty if no emote is needed.",
            enum: ["", "hello", "wave", "bow", "yes", "no", "twerk", "spin", "pogo", "cheer"]
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
    required: ["thought", "say_in_game", "emote", "execute_command", "requires_more_actions", "current_goal_status", "manage_memories"],
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
                        // Format the goal status object into a readable string
                        let goalStatusString = `[Goal Status]: Title: ${turn.current_goal_status.title} (Status: ${turn.current_goal_status.status})\n`;
                        if (turn.current_goal_status.subtasks && turn.current_goal_status.subtasks.length > 0) {
                            goalStatusString += "  Subtasks:\n";
                            turn.current_goal_status.subtasks.forEach((subtask, index) => {
                                goalStatusString += `    ${index + 1}. ${subtask.description} (Status: ${subtask.status})\n`;
                            });
                        }
                        formattedContent += goalStatusString;
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
                
                const response = await axios.post('https://api.openai.com/v1/chat/completions', requestBody, { headers });
                try {
                    const jsonContent = JSON.parse(response.data.choices[0].message.content);
                    return { json: jsonContent };
                } catch (e) {
                    console.error("OpenAI response JSON parsing error:", e, response.data.choices[0].message.content);
                    return { json: { error: "Failed to parse OpenAI JSON response: " + e.message } };
                }

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

                // Request arraybuffer to handle potential multipart responses
                const response = await axios.post(`${HTTPS_BACKEND_URL}/openai/chat`, requestBody, {
                    headers,
                    responseType: 'arraybuffer' // Crucial for handling binary/multipart
                });

                const contentType = response.headers['content-type'];
                const responseBuffer = Buffer.from(response.data);

                console.log("[Proxy] Response content type:", contentType);

                if (contentType && contentType.startsWith('multipart/mixed')) {
                    const boundaryMatch = contentType.match(/boundary=(.+)$/);
                    if (!boundaryMatch) return { json: { error: "Multipart response missing boundary string."}};
                    
                    const boundary = boundaryMatch[1];
                    let parsedJson = null;
                    let audioWavData = null;

                    try {
                        const parts = this._parseMultipart(responseBuffer, boundary);
                        for (const part of parts) {
                            if (part.headers.includes('application/json')) {
                                parsedJson = JSON.parse(part.body.toString('utf-8'));
                            } else if (part.headers.includes('audio/wav')) {
                                audioWavData = part.body;
                            }
                        }

                        if (!parsedJson) throw new Error("No JSON part in multipart response");
                        return { json: parsedJson, audio: audioWavData }; // audioWavData will be null if not present
                    } catch (e) {
                        console.error("Multipart processing error:", e);
                        return { json: { error: "Multipart processing error: " + e.message } };
                    }
                } else if (contentType && contentType.startsWith('application/json')) {
                    // Standard JSON response
                    try {
                        const jsonString = responseBuffer.toString('utf-8');
                        return { json: JSON.parse(jsonString) };
                    } catch (e) {
                        console.error("Failed to parse application/json response:", e);
                        return { json: { error: "Failed to parse backend JSON response: " + e.message } };
                    }
                } else {
                    const errorMsg = `Unexpected content type: ${contentType}. Expected application/json or multipart/mixed.`;
                    console.error(errorMsg);
                    return { json: { error: errorMsg } };
                }
            }

        } catch (err) {
            let errorResponseMessage = "Request failed: ";
            if (err.response) {
                let errorDetailText = "Unknown server error.";
                if (err.response.data) {
                    let responseDataText;
                    if (err.response.data instanceof ArrayBuffer) {
                        responseDataText = Buffer.from(err.response.data).toString();
                    } else {
                        responseDataText = err.response.data; // Could be string or object already
                    }

                    try {
                        const parsedErrorData = (typeof responseDataText === 'string' && responseDataText.startsWith('{')) ? JSON.parse(responseDataText) : responseDataText;
                        if (typeof parsedErrorData === 'object' && parsedErrorData !== null && parsedErrorData.error) {
                            if (typeof parsedErrorData.error === 'string') {
                                errorDetailText = parsedErrorData.error;
                            } else if (typeof parsedErrorData.error.message === 'string') {
                                errorDetailText = parsedErrorData.error.message; // Common for OpenAI
                            }
                        } else if (typeof parsedErrorData === 'string') {
                            errorDetailText = parsedErrorData;
                        } else {
                            // Keep it simple if no clear error string is found in a known structure
                            errorDetailText = (typeof responseDataText === 'string') ? responseDataText.substring(0, 200) : "Complex error object received.";
                        }
                    } catch (parseError) {
                        errorDetailText = (typeof responseDataText === 'string') ? responseDataText.substring(0, 200) : "Could not parse error data string.";
                    }
                }
                errorResponseMessage += `Status ${err.response.status}: ${errorDetailText}`;

            } else if (err.request) {
                 errorResponseMessage += "Cannot reach the service. Check internet connection or API endpoint.";
            } else {
                 errorResponseMessage += err.message || "An unexpected error occurred.";
            }
            // Log the more detailed error for server-side debugging
            console.error("[Proxy Send Error] Original Error:", err.message, "Formatted Response:", errorResponseMessage);
            return { json: { error: errorResponseMessage } }; // Wrap error in the standard structure
        }
    }

    _parseMultipart(buffer, boundary) {
        const parts = [];
        const boundaryLine = Buffer.from(`--${boundary}`);
        const crlf = Buffer.from('\r\n');
        const doubleCrlf = Buffer.from('\r\n\r\n');
        let currentPos = 0;

        while (currentPos < buffer.length) {
            const boundaryStart = buffer.indexOf(boundaryLine, currentPos);
            if (boundaryStart === -1) break; // No more boundaries

            // Check for final boundary: --boundary--
            if (buffer.indexOf(Buffer.from('--'), boundaryStart + boundaryLine.length) === boundaryStart + boundaryLine.length) {
                break; // End of multipart content
            }

            const headersEnd = buffer.indexOf(doubleCrlf, boundaryStart);
            if (headersEnd === -1) {
                console.error("Multipart part missing headers end (\r\n\r\n).");
                break; // Malformed part
            }

            const headersStart = boundaryStart + boundaryLine.length + crlf.length;
            const headersString = buffer.toString('utf-8', headersStart, headersEnd);
            const bodyStart = headersEnd + doubleCrlf.length;

            // Find the start of the next boundary to delimit current part's body
            const nextBoundaryStart = buffer.indexOf(boundaryLine, bodyStart);
            let bodyEnd;

            if (nextBoundaryStart !== -1) {
                bodyEnd = nextBoundaryStart - crlf.length; // Body ends before the CRLF of the next boundary line
            } else {
                // This case should not be reached if the multipart message is correctly terminated with --boundary--
                // It implies a malformed message or this is the last part without a final boundary properly detected above.
                console.warn("Could not find next boundary, assuming rest of buffer is last part body. Check multipart termination.");
                // Attempt to find final boundary to avoid including it in the body
                const finalBoundaryOverall = Buffer.from(`--${boundary}--`);
                const finalBoundaryPos = buffer.indexOf(finalBoundaryOverall, bodyStart);
                if (finalBoundaryPos !== -1) {
                    bodyEnd = finalBoundaryPos - crlf.length;
                } else {
                    bodyEnd = buffer.length; // Fallback, but likely problematic
                }
            }
            
            if (bodyEnd < bodyStart) { // Check for invalid body range
                console.error("Invalid body range calculated for multipart part. Skipping.");
                if(nextBoundaryStart !== -1) currentPos = nextBoundaryStart;
                else break;
                continue;
            }

            const bodyBuffer = buffer.subarray(bodyStart, bodyEnd);
            parts.push({ headers: headersString, body: bodyBuffer });

            currentPos = nextBoundaryStart;
            if (currentPos === -1 && buffer.indexOf(Buffer.from(`--${boundary}--`), bodyStart) === -1 ) {
                // If no next boundary found, and it's not because we are at the end, something is wrong.
                console.error("Malformed multipart: No next boundary and not at final boundary.")
                break;
            }
        }
        return parts;
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