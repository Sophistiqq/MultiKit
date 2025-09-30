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
  persistUser?: boolean; // Enable localStorage persistence
  storageKey?: string; // Custom storage key
}

type SubscriberCallback = (user: User | null) => void;

export class AuthClient {
  private baseUrl: string;
  private authPrefix: string;
  private user: User | null = null;
  private subscribers: Set<SubscriberCallback> = new Set();
  private initialized: boolean = false;
  private fetchConfig: RequestInit;
  private persistUser: boolean;
  private storageKey: string;

  constructor(baseUrl: string, options: AuthClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authPrefix = options.authPrefix || '/auth';
    this.persistUser = options.persistUser ?? false;
    this.storageKey = options.storageKey || 'auth_user';

    // Default fetch configuration
    this.fetchConfig = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options.fetchConfig
    };

    // Load user from localStorage if persistence is enabled
    if (this.persistUser && typeof window !== 'undefined') {
      this.loadUserFromStorage();
    }
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

    // Persist to localStorage if enabled
    if (this.persistUser && typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem(this.storageKey, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.storageKey);
      }
    }
  }

  /**
   * Load user from localStorage
   */
  private loadUserFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.user = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load user from storage:', error);
      localStorage.removeItem(this.storageKey);
    }
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

    // If we have a cached user, notify subscribers immediately
    if (this.user && this.persistUser) {
      this.notify();
    }

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
      // If we have cached user but API fails, keep the cached user
      if (!this.user) {
        this.setUser(null);
      }
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
