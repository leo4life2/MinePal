import axios from 'axios';
import { HTTPS_BACKEND_URL } from '../constants.js';
import fs from 'fs';
import path from 'path';

const deepClone = (value) => JSON.parse(JSON.stringify(value));

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

    async sendChatCompletion({ messages, responseSchema = null, extraRequestFields = {} }) {
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('sendChatCompletion requires a non-empty messages array.');
        }

        const baseRequestBody = { messages };

        if (responseSchema) {
            baseRequestBody.response_format = this._buildResponseFormat(responseSchema);
        }

        try {
            const headers = {};
            const token = await this.getJWT();
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const requestBody = {
                ...baseRequestBody,
                ...extraRequestFields
            };

            const response = await axios.post(`${HTTPS_BACKEND_URL}/openai/chat`, requestBody, {
                headers,
                responseType: 'arraybuffer'
            });

            const contentType = response.headers['content-type'];
            const responseBuffer = Buffer.from(response.data);

            if (contentType && contentType.startsWith('multipart/mixed')) {
                const boundaryMatch = contentType.match(/boundary=(.+)$/);
                if (!boundaryMatch) return { json: { error: `Multipart response missing boundary string. Content-Type header: ${contentType}` } };

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

                    if (!parsedJson) throw new Error('No JSON part in multipart response');
                    return { json: parsedJson, audio: audioWavData };
                } catch (e) {
                    console.error('Multipart processing error:', e);
                    return { json: { error: `Multipart processing error: ${e.message}` } };
                }
            } else if (contentType && contentType.startsWith('application/json')) {
                try {
                    const jsonString = responseBuffer.toString('utf-8');
                    const parsedJson = JSON.parse(jsonString);

                    if (parsedJson.audio_status === 'failed' && parsedJson.text_response && parsedJson.audio_error_details) {
                        console.error('Audio generation failed (reported by backend):');
                        console.error('TTS Service Error Details:', parsedJson.audio_error_details);
                        try {
                            const actualJsonResponse = JSON.parse(parsedJson.text_response);
                            return { json: actualJsonResponse, audio_failed_but_text_ok: true };
                        } catch (textParseError) {
                            const truncatedTextResponse = typeof parsedJson.text_response === 'string'
                                ? parsedJson.text_response.slice(0, 200) + (parsedJson.text_response.length > 200 ? '...' : '')
                                : '<non-string payload>';
                            console.error('Failed to parse text_response in audio failure case (200 OK):', textParseError, parsedJson.text_response);
                            return { json: { error: `Audio failed and backend text_response was malformed: ${textParseError.message}. Raw (truncated): ${truncatedTextResponse}` } };
                        }
                    } else {
                        return { json: parsedJson };
                    }
                } catch (e) {
                    const truncatedJsonString = typeof responseBuffer === 'object' && responseBuffer
                        ? responseBuffer.toString('utf-8', 0, Math.min(responseBuffer.length, 200)) + (responseBuffer.length > 200 ? '...' : '')
                        : '<unavailable>';
                    console.error('Failed to parse application/json response:', e, truncatedJsonString);
                    return { json: { error: `Failed to parse backend JSON response: ${e.message}. Raw payload (truncated): ${truncatedJsonString}` } };
                }
            } else {
                const errorMsg = `Unexpected content type: ${contentType}. Expected application/json or multipart/mixed.`;
                console.error(errorMsg);
                return { json: { error: errorMsg } };
            }

        } catch (err) {
            let errorResponseMessage = 'Request failed: ';
            if (err.response) {
                let errorDetailText = 'Unknown server error.';
                if (err.response.data) {
                    let responseDataText;
                    if (err.response.data instanceof ArrayBuffer) {
                        responseDataText = Buffer.from(err.response.data).toString();
                    } else if (Buffer.isBuffer(err.response.data)) {
                        responseDataText = err.response.data.toString();
                    } else {
                        responseDataText = err.response.data;
                    }

                    try {
                        console.log('[Proxy] Response data text:', responseDataText);

                        if (typeof responseDataText === 'object' && responseDataText !== null &&
                            responseDataText.type === 'Buffer' && Array.isArray(responseDataText.data)) {
                            responseDataText = Buffer.from(responseDataText.data).toString();
                        }

                        const parsedErrorData = (typeof responseDataText === 'string' && responseDataText.startsWith('{')) ? JSON.parse(responseDataText) : responseDataText;
                        if (typeof parsedErrorData === 'object' && parsedErrorData !== null && parsedErrorData.error) {
                            if (typeof parsedErrorData.error === 'string') {
                                errorDetailText = parsedErrorData.error;
                            } else if (typeof parsedErrorData.error.message === 'string') {
                                errorDetailText = parsedErrorData.error.message;
                            }
                        } else if (typeof parsedErrorData === 'string') {
                            errorDetailText = parsedErrorData;
                        } else {
                            errorDetailText = (typeof responseDataText === 'string') ? responseDataText : JSON.stringify(responseDataText);
                        }
                    } catch (parseError) {
                        errorDetailText = (typeof responseDataText === 'string') ? responseDataText : JSON.stringify(responseDataText);
                    }
                }
                errorResponseMessage += `Status ${err.response.status}: ${errorDetailText}`;

            } else if (err.request) {
                const requestCode = err.code ? ` (${err.code})` : '';
                const requestDetail = (err.message && err.message !== 'AxiosError') ? ` Details: ${err.message}` : '';
                errorResponseMessage += `No response received from upstream service${requestCode}.${requestDetail}`;
            } else {
                const fallbackCode = err.code ? ` (${err.code})` : '';
                const fallbackMessage = err.message && err.message !== 'AxiosError' ? err.message : 'An unexpected error occurred.';
                errorResponseMessage += `Client-side error${fallbackCode}: ${fallbackMessage}`;
            }
            console.error('[Proxy Send Error] Original Error:', err.message, 'Formatted Response:', errorResponseMessage);
            return { json: { error: errorResponseMessage } };
        }
    }

    _buildResponseFormat(responseSchema) {
        const { name, schema, strict = true } = responseSchema;
        if (!name) {
            throw new Error('responseSchema.name is required');
        }
        if (!schema || typeof schema !== 'object') {
            throw new Error('responseSchema.schema must be an object');
        }

        const schemaClone = deepClone(schema);

        return {
            type: 'json_schema',
            json_schema: {
                name,
                schema: schemaClone,
                strict
            }
        };
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
                    const apiMessage = err.response.data?.error?.message || 'Invalid Key or Permissions';
                    console.error(`[Proxy Embed Error] OpenAI API Key Error (${err.response.status}): ${apiMessage}`);
                    throw new Error(`OpenAI API Key Error (${err.response.status}): ${apiMessage}`); 
                }
                 // Specific handling for Backend 403 errors (assuming JWT based)
                if (!this.openai_api_key && err.response && err.response.status === 403) {
                    const backendMessage = err.response.data?.error || 'Check JWT or backend permissions';
                    console.error(`[Proxy Embed Error] Access Forbidden: ${backendMessage}`);
                    throw new Error(`Access forbidden: ${backendMessage}`);
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