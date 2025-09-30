/**
 * AuthClient - Reusable authentication client for cookie-based auth
 * Works with any frontend framework (React, Svelte, Vue, vanilla JS, etc.)
 * 
 * @example
 * const auth = new AuthClient('http://localhost:3000');
 * 
 * // Subscribe to auth state changes
 * auth.subscribe((user) => {
 *   console.log('Current user:', user);
 * });
 * 
 * // Initialize (checks if already logged in)
 * await auth.init();
 * 
 * // Login
 * const result = await auth.login('username', 'password');


Example usage:

import { AuthClient, User, RegisterData } from './AuthClient';

const auth = new AuthClient('http://localhost:3000', {
  authPrefix: '/auth', // optional
  headers: { 'X-Custom-Header': 'value' } // optional
});

// Subscribe with typed callback
auth.subscribe((user: User | null) => {
  if (user) {
    console.log(`Welcome ${user.username}!`);
  }
});

// Login with type checking
const loginResult = await auth.login('username', 'password');
if (loginResult.success && loginResult.data) {
  console.log(loginResult.data.email); // Type-safe access
}

// Register with typed data
const registerData: RegisterData = {
  username: 'newuser',
  password: 'securepass',
  email: 'user@example.com',
  firstname: 'John'
};
await auth.register(registerData);

*/

// Types
export interface User {
  id: number;
  username: string;
  email: string;
  firstname?: string;
  lastname?: string;
  age?: number;
  phone?: string;
  address?: string;
  created_at?: string;
}

export interface RegisterData {
  username: string;
  password: string;
  email: string;
  firstname?: string;
  lastname?: string;
  age?: number;
  phone?: string;
  address?: string;
}

export interface UpdateProfileData {
  firstname?: string;
  lastname?: string;
  age?: number;
  phone?: string;
  address?: string;
}

export interface AuthResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export interface LoginResponse {
  message: string;
  user: User;
}

export interface AuthClientOptions {
  authPrefix?: string;
  headers?: Record<string, string>;
  fetchConfig?: RequestInit;
}

type SubscriberCallback = (user: User | null) => void;

export class AuthClient {
  private baseUrl: string;
  private authPrefix: string;
  private user: User | null = null;
  private subscribers: Set<SubscriberCallback> = new Set();
  private initialized: boolean = false;
  private fetchConfig: RequestInit;

  constructor(baseUrl: string, options: AuthClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authPrefix = options.authPrefix || '/auth';

    // Default fetch configuration
    this.fetchConfig = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options.fetchConfig
    };
  }

  /**
   * Subscribe to authentication state changes
   * @param callback - Called whenever user state changes
   * @returns Unsubscribe function
   */
  subscribe(callback: SubscriberCallback): () => void {
    this.subscribers.add(callback);
    // Immediately call with current state
    callback(this.user);

    // Return unsubscribe function
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers of state change
   */
  private notify(): void {
    this.subscribers.forEach(callback => callback(this.user));
  }

  /**
   * Set user state and notify subscribers
   */
  private setUser(user: User | null): void {
    this.user = user;
    this.notify();
  }

  /**
   * Make authenticated request
   */
  async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...this.fetchConfig,
      ...options,
      headers: {
        ...this.fetchConfig.headers,
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);

      // Auto-logout on 401
      if (response.status === 401 && this.user) {
        this.setUser(null);
      }

      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  }

  /**
   * Initialize - check if user is already authenticated
   */
  async init(): Promise<User | null> {
    if (this.initialized) return this.user;

    try {
      const response = await this.fetch(`${this.authPrefix}/me`);

      if (response.ok) {
        const user = await response.json() as User;
        this.setUser(user);
      } else {
        this.setUser(null);
      }
    } catch (error) {
      console.error('Auth init error:', error);
      this.setUser(null);
    }

    this.initialized = true;
    return this.user;
  }

  /**
   * Register new user
   */
  async register(userData: RegisterData): Promise<AuthResponse> {
    try {
      const response = await this.fetch(`${this.authPrefix}/register`, {
        method: 'POST',
        body: JSON.stringify(userData)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Registration failed',
          status: response.status
        };
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Login user
   */
  async login(username: string, password: string): Promise<AuthResponse<User>> {
    try {
      const response = await this.fetch(`${this.authPrefix}/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json() as LoginResponse;

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Login failed',
          status: response.status
        };
      }

      this.setUser(data.user);
      return { success: true, data: data.user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<AuthResponse> {
    try {
      await this.fetch(`${this.authPrefix}/logout`, {
        method: 'POST'
      });

      this.setUser(null);
      return { success: true };
    } catch (error) {
      // Clear state anyway
      this.setUser(null);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: UpdateProfileData): Promise<AuthResponse> {
    try {
      const response = await this.fetch(`${this.authPrefix}/me`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Update failed',
          status: response.status
        };
      }

      // Refresh user data
      await this.init();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      const response = await this.fetch(`${this.authPrefix}/change-password`, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Password change failed',
          status: response.status
        };
      }

      // Clear user (requires re-login)
      this.setUser(null);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Get all users (admin)
   */
  async getUsers(): Promise<AuthResponse<User[]>> {
    try {
      const response = await this.fetch(`${this.authPrefix}/users`);

      if (!response.ok) {
        const data = await response.json();
        return {
          success: false,
          error: data.message || 'Failed to fetch users',
          status: response.status
        };
      }

      const users = await response.json() as User[];
      return { success: true, data: users };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId: number): Promise<AuthResponse> {
    try {
      const response = await this.fetch(`${this.authPrefix}/user/${userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Delete failed',
          status: response.status
        };
      }

      // If deleting self, clear user state
      if (this.user && this.user.id === userId) {
        this.setUser(null);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.user;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.user !== null;
  }

  /**
   * Wait for initialization
   */
  async ready(): Promise<User | null> {
    if (this.initialized) return this.user;
    return this.init();
  }
}
