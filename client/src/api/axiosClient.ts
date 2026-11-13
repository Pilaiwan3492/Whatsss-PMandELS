import axios from 'axios';

const defaultBaseUrl = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';

export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});
