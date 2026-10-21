const API_BASE = '/api';

export const api = {
  getToken: () => localStorage.getItem('token'),
  setToken: (token: string) => localStorage.setItem('token', token),
  removeToken: () => localStorage.removeItem('token'),

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }

    return data as T;
  },

  // Auth Endpoints
  register(data: { indexNumber: string; name: string; email: string; password: string }) {
    return this.request<{ success: boolean; message: string; email: string; indexNumber: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  verifyEmail(data: { email: string; code: string }) {
    return this.request<{ success: boolean; token: string; user: any }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  resendOtp(email: string) {
    return this.request<{ success: boolean; message: string }>('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  login(data: { identifier: string; password: string }) {
    return this.request<{ success: boolean; token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMe() {
    return this.request<{ success: boolean; user: any }>('/auth/me');
  },

  // Umbrella & Station Endpoints
  getSlots() {
    return this.request<{
      success: boolean;
      slots: any[];
      meta: { total: number; available: number; borrowed: number };
      station: any;
    }>('/umbrella/slots');
  },

  getMyActiveBorrow() {
    return this.request<{ success: boolean; hasActiveBorrow: boolean; borrow: any }>('/umbrella/my-borrow');
  },

  borrowUmbrella(slotNumber: number) {
    return this.request<{ success: boolean; message: string; slot: any }>('/umbrella/borrow', {
      method: 'POST',
      body: JSON.stringify({ slotNumber }),
    });
  },

  returnUmbrella(slotNumber: number) {
    return this.request<{ success: boolean; message: string }>('/umbrella/return', {
      method: 'POST',
      body: JSON.stringify({ slotNumber }),
    });
  },

  adminUnlock(slotNumber: number, durationMs = 5000) {
    return this.request<{ success: boolean; message: string; mqttSent: boolean }>('/umbrella/admin-unlock', {
      method: 'POST',
      body: JSON.stringify({ slotNumber, durationMs }),
    });
  },
};
