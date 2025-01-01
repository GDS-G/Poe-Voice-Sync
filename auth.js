// auth.js
class AuthHandler {
    constructor() {
        this.isAuthenticated = false;
        this.userEmail = null;
        this.checkAuthState();
    }

    async checkAuthState() {
        try {
            const authData = await chrome.storage.sync.get(['userEmail', 'isAuthenticated']);
            this.isAuthenticated = authData.isAuthenticated || false;
            this.userEmail = authData.userEmail || null;
            return this.isAuthenticated;
        } catch (error) {
            console.error('Error checking auth state:', error);
            return false;
        }
    }

    async signIn() {
        try {
            const auth = await chrome.identity.getAuthToken({ interactive: true });
            if (!auth) {
                throw new Error('Authentication failed');
            }

            // Get user info using the auth token
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${auth.token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to get user info');
            }

            const userInfo = await response.json();

            // Store auth state
            await chrome.storage.sync.set({
                isAuthenticated: true,
                userEmail: userInfo.email
            });

            this.isAuthenticated = true;
            this.userEmail = userInfo.email;

            return {
                success: true,
                email: userInfo.email
            };
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async signOut() {
        try {
            // Get current token
            const token = await chrome.identity.getAuthToken({ interactive: false });

            if (token) {
                // Revoke token
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token.token}`);
                // Remove from cache
                await chrome.identity.removeCachedAuthToken({ token: token.token });
            }

            // Clear storage
            await chrome.storage.sync.remove(['userEmail', 'isAuthenticated', 'licenseKey']);

            this.isAuthenticated = false;
            this.userEmail = null;

            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            // Even if there's an error, clear local state
            this.isAuthenticated = false;
            this.userEmail = null;
            await chrome.storage.sync.remove(['userEmail', 'isAuthenticated', 'licenseKey']);

            return {
                success: false,
                error: error.message
            };
        }
    }

    async getAuthState() {
        await this.checkAuthState();
        return {
            isAuthenticated: this.isAuthenticated,
            userEmail: this.userEmail
        };
    }
}

// Create and export a singleton instance
const authHandler = new AuthHandler();
export default authHandler;