import axios from 'axios';
import { HTTPS_BACKEND_URL } from '../constants.js';
import fs from 'fs';
import path from 'path';

const deepClone = (value) => JSON.parse(JSON.stringify(value));

/**
 * @typedef {Object} ResponsesPayload
 * @description Raw payload returned by the OpenAI Responses API. We only depend on the fields documented here.
 * @property {string} [output_text] - Assistant-rendered text, when available.
 * @property {Array<ResponsesOutputItem>} [output] - Structured output items (messages, tool calls, JSON schema chunks, etc.).
 * @property {string} [audio_status] - TTS status supplied by the backend.
 */

/**
 * @typedef {Object} ResponsesOutputItem
 * @property {string} type - E.g. "message", "tool_call", etc.
 * @property {Array<ResponsesOutputContent>} [content] - Typed content emitted for this item.
 */

/**
 * @typedef {Object} ResponsesOutputContent
 * @property {string} type - E.g. "output_text", "json_schema", "output_json".
 * @property {string} [text] - Text payload for the chunk.
 * @property {Object} [parsed] - When provided by Responses for structured content.
 * @property {Object} [json] - When provided by Responses for structured content.
 */

/**
 * @typedef {Object} MinepalLLMResult
 * @description Normalized interface consumed by MinePal runtime.
 * @property {Object|null} json - Structured response body (say_in_game, execute_command, etc.).
 * @property {Buffer|null} audio - Synthesized audio buffer if provided.
 * @property {string|undefined} assistant_text - Plain assistant text suitable for UI/logging.
 * @property {{ string_for_speech?: string, tone_and_style?: string }|null} speech_metadata - Speech hints parsed from payload.
 * @property {string|null|undefined} audio_status - Backend audio status ("succeeded" | "skipped" | "failed", etc.).
 * @property {boolean} audio_failed_but_text_ok - Indicates TTS failed but structured text is usable.
 * @property {ResponsesPayload|null} raw_response - Extracted Responses payload (for debugging/advanced handling).
 * @property {Object} raw_backend_response - Unmodified payload returned by the backend (includes MinePal-specific wrappers).
 */

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

    /**
     * @param {{ messages: Array, responseSchema?: Object|null, extraRequestFields?: Object, sourcePrompter?: string }} params
     * @returns {Promise<MinepalLLMResult>}
     */
    async sendChatCompletion({ messages, responseSchema = null, extraRequestFields = {}, sourcePrompter = 'unknown' }) {
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
                ...extraRequestFields,
                source_prompter: sourcePrompter
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
                    const normalized = this._normalizeResponsesPayload(parsedJson);
                    return {
                        json: normalized.structuredResult ?? parsedJson,
                        audio: audioWavData,
                        assistant_text: normalized.assistantText,
                        speech_metadata: normalized.speechMetadata,
                        audio_status: normalized.audioStatus ?? parsedJson.audio_status,
                        audio_failed_but_text_ok: normalized.audioFailedButTextOk,
                        raw_response: normalized.rawResponsesPayload ?? null,
                        raw_backend_response: parsedJson
                    };
                } catch (e) {
                    console.error('Multipart processing error:', e);
                    return { json: { error: `Multipart processing error: ${e.message}` } };
                }
            } else if (contentType && contentType.startsWith('application/json')) {
                try {
                    const jsonString = responseBuffer.toString('utf-8');
                    const parsedJson = JSON.parse(jsonString);
                    const normalized = this._normalizeResponsesPayload(parsedJson);

                    if (parsedJson.audio_status === 'failed') {
                        console.error('Audio generation failed (reported by backend):');
                        if (parsedJson.audio_error_details) {
                            console.error('TTS Service Error Details:', parsedJson.audio_error_details);
                        }

                        if (normalized.audioFailedButTextOk && normalized.structuredResult) {
                            return {
                                json: normalized.structuredResult,
                                audio_failed_but_text_ok: true,
                                assistant_text: normalized.assistantText,
                                speech_metadata: normalized.speechMetadata,
                                audio_status: normalized.audioStatus ?? parsedJson.audio_status,
                                raw_response: normalized.rawResponsesPayload ?? null,
                                raw_backend_response: parsedJson
                            };
                        }

                        const truncatedAssistantText = typeof normalized.assistantText === 'string'
                            ? normalized.assistantText.slice(0, 200) + (normalized.assistantText.length > 200 ? '...' : '')
                            : '<unavailable>';
                        const truncatedTextResponse = typeof parsedJson.text_response === 'string'
                            ? parsedJson.text_response.slice(0, 200) + (parsedJson.text_response.length > 200 ? '...' : '')
                            : '<unavailable>';

                        return {
                            json: {
                                error: `Audio failed and no structured text payload was returned. Assistant text (truncated): ${truncatedAssistantText}. Raw text_response (truncated): ${truncatedTextResponse}`
                            }
                        };
                    }

                    return {
                        json: normalized.structuredResult ?? parsedJson,
                        assistant_text: normalized.assistantText,
                        speech_metadata: normalized.speechMetadata,
                        audio_status: normalized.audioStatus ?? parsedJson.audio_status,
                        raw_response: normalized.rawResponsesPayload ?? null,
                        raw_backend_response: parsedJson,
                        audio_failed_but_text_ok: normalized.audioFailedButTextOk
                    };
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

    /**
     * Transform the backend Responses payload into the MinePal runtime interface.
     * This explicitly documents the "Responses -> MinePal" mapping for clarity.
     * @param {Object} rawPayload
     * @returns {{
     *  structuredResult: Object|null,
     *  assistantText: string|undefined,
     *  speechMetadata: { string_for_speech?: string, tone_and_style?: string }|null,
     *  audioStatus: string|null,
     *  rawResponsesPayload: ResponsesPayload|null,
     *  audioFailedButTextOk: boolean
     * }}
     */
    _normalizeResponsesPayload(rawPayload) {
        if (!rawPayload || typeof rawPayload !== 'object') {
            return {
                structuredResult: rawPayload ?? null,
                assistantText: undefined,
                speechMetadata: null,
                audioStatus: null,
                rawResponsesPayload: null,
                audioFailedButTextOk: false
            };
        }

        if (rawPayload.error && typeof rawPayload.error === 'string') {
            return {
                structuredResult: rawPayload,
                assistantText: undefined,
                speechMetadata: null,
                audioStatus: rawPayload.audio_status ?? null,
                rawResponsesPayload: null,
                audioFailedButTextOk: false
            };
        }

        const responsesPayload = this._getResponsesPayload(rawPayload);
        const assistantText = this._extractAssistantText(responsesPayload);
        const parsedFromText = this._maybeParseAssistantTextAsJson(assistantText);

        let structuredResult = this._extractResponseJson(responsesPayload);

        if (!structuredResult && parsedFromText?.parsed && typeof parsedFromText.parsed === 'object') {
            structuredResult = parsedFromText.parsed;
        }

        if (!structuredResult && rawPayload.response_json && typeof rawPayload.response_json === 'object') {
            structuredResult = rawPayload.response_json;
        }

        if (!structuredResult && typeof rawPayload.text_response === 'string') {
            const parsedTextResponse = this._safeJsonParse(rawPayload.text_response);
            if (parsedTextResponse) {
                structuredResult = parsedTextResponse;
            }
        }

        if (!structuredResult && rawPayload && typeof rawPayload === 'object' && !this._isResponsesPayload(rawPayload)) {
            structuredResult = rawPayload;
        }

        const speechMetadata = this._extractSpeechMetadata(structuredResult, parsedFromText?.parsed);

        const audioStatus = rawPayload.audio_status ?? responsesPayload?.audio_status ?? null;
        const audioFailedButTextOk = audioStatus === 'failed'
            && structuredResult
            && typeof structuredResult === 'object'
            && Object.keys(structuredResult).length > 0;

        if (!structuredResult && this._isResponsesPayload(responsesPayload)) {
            console.warn('[Proxy] Unable to extract structured response from Responses payload. Returning raw payload.');
        }

        return {
            structuredResult: structuredResult ?? null,
            assistantText,
            speechMetadata,
            audioStatus,
            rawResponsesPayload: this._isResponsesPayload(responsesPayload) ? responsesPayload : null,
            audioFailedButTextOk
        };
    }

    _getResponsesPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        if (payload.response && typeof payload.response === 'object') {
            return payload.response;
        }

        if (Array.isArray(payload.responses) && payload.responses.length > 0) {
            return payload.responses[0];
        }

        if (this._isResponsesPayload(payload)) {
            return payload;
        }

        return null;
    }

    _isResponsesPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return false;
        }

        if (Array.isArray(payload.output)) {
            return true;
        }

        if (typeof payload.output_text === 'string') {
            return true;
        }

        if (typeof payload.type === 'string' && payload.type === 'response') {
            return true;
        }

        return false;
    }

    _extractAssistantText(responsesPayload) {
        const payload = responsesPayload && typeof responsesPayload === 'object'
            ? responsesPayload
            : null;

        if (!payload) {
            return undefined;
        }

        if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
            return payload.output_text;
        }

        const messageSegments = [];
        const outputItems = Array.isArray(payload.output) ? payload.output : [];

        for (const item of outputItems) {
            if (!item || item.type !== 'message' || !Array.isArray(item.content)) {
                continue;
            }

            for (const chunk of item.content) {
                if (chunk?.type === 'output_text' && typeof chunk.text === 'string') {
                    messageSegments.push(chunk.text);
                }
            }
        }

        return messageSegments.length > 0 ? messageSegments.join('') : undefined;
    }

    _extractResponseJson(responsesPayload) {
        if (!responsesPayload || typeof responsesPayload !== 'object') {
            return null;
        }

        const outputItems = Array.isArray(responsesPayload.output) ? responsesPayload.output : [];
        const parsedChunks = [];

        for (const item of outputItems) {
            if (!item || !Array.isArray(item.content)) {
                continue;
            }

            for (const chunk of item.content) {
                if (!chunk || typeof chunk !== 'object') {
                    continue;
                }

                if (chunk.type === 'json_schema') {
                    if (chunk.parsed && typeof chunk.parsed === 'object') {
                        parsedChunks.push(chunk.parsed);
                    } else if (typeof chunk.text === 'string') {
                        const parsed = this._safeJsonParse(chunk.text);
                        if (parsed && typeof parsed === 'object') {
                            parsedChunks.push(parsed);
                        }
                    }
                } else if (chunk.type === 'output_json') {
                    if (chunk.json && typeof chunk.json === 'object') {
                        parsedChunks.push(chunk.json);
                    } else if (typeof chunk.text === 'string') {
                        const parsed = this._safeJsonParse(chunk.text);
                        if (parsed && typeof parsed === 'object') {
                            parsedChunks.push(parsed);
                        }
                    }
                }
            }
        }

        if (parsedChunks.length === 0) {
            return null;
        }

        if (parsedChunks.length === 1) {
            return parsedChunks[0];
        }

        return parsedChunks.reduce((acc, current) => {
            if (current && typeof current === 'object') {
                Object.assign(acc, current);
            }
            return acc;
        }, {});
    }

    _maybeParseAssistantTextAsJson(assistantText) {
        if (typeof assistantText !== 'string') {
            return null;
        }

        let trimmed = assistantText.trim();
        if (!trimmed) {
            return null;
        }

        const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
        if (codeBlockMatch) {
            trimmed = codeBlockMatch[1].trim();
        }

        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            return null;
        }

        const parsed = this._safeJsonParse(trimmed);
        if (parsed && typeof parsed === 'object') {
            return { parsed };
        }

        return null;
    }

    _extractSpeechMetadata(structuredResult, parsedFromText) {
        const metadata = {};

        if (structuredResult && typeof structuredResult === 'object') {
            if (typeof structuredResult.string_for_speech === 'string') {
                metadata.string_for_speech = structuredResult.string_for_speech;
            }
            if (typeof structuredResult.tone_and_style === 'string') {
                metadata.tone_and_style = structuredResult.tone_and_style;
            }
        }

        if (parsedFromText && typeof parsedFromText === 'object') {
            if (metadata.string_for_speech === undefined && typeof parsedFromText.string_for_speech === 'string') {
                metadata.string_for_speech = parsedFromText.string_for_speech;
            }
            if (metadata.tone_and_style === undefined && typeof parsedFromText.tone_and_style === 'string') {
                metadata.tone_and_style = parsedFromText.tone_and_style;
            }
        }

        return Object.keys(metadata).length > 0 ? metadata : null;
    }

    _safeJsonParse(value) {
        if (typeof value !== 'string') {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
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