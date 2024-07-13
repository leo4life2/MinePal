import axios from 'axios';

const BACKEND_HOST = 'https://backend.minepal.net:11111';
export class GPT {
    constructor(model_name) {
        this.model_name = model_name;
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        let res = null;
        try {
            console.log('Awaiting backend API response...');
            const response = await axios.post(`${BACKEND_HOST}/openai/chat`, {
                model_name: this.model_name,
                messages: messages,
                stop_seq: stop_seq,
            });
            res = response.data;
        } catch (err) {
            if ((err.message.includes('Context length exceeded') || err.response?.status === 500) && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text) {
        try {
            const response = await axios.post(`${BACKEND_HOST}/openai/embed`, {
                model_name: this.model_name,
                text: text,
            });
            return response.data;
        } catch (err) {
            console.log(err);
            throw new Error('Failed to get embedding');
        }
    }
}