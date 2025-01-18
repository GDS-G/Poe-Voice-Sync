// auth.js
class AuthHandler {
    constructor() {
        this.isAuthenticated = false;
        this.userEmail = null;
        this.checkAuthState();
    }

    async checkAuthState() {
        try {
            // Check both sync and local storage
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(['userEmail', 'isAuthenticated']),
                chrome.storage.local.get(['userEmail', 'isAuthenticated'])
            ]);

            // Prefer sync storage data
            const authData = syncData.isAuthenticated ? syncData : localData;
            this.isAuthenticated = authData.isAuthenticated || false;
            this.userEmail = authData.userEmail || null;

            return this.isAuthenticated;
        } catch (error) {
            console.error('Error checking auth state:', error);
            return false;
        }
    }

    async silentSignIn() {
        try {
            console.log('Attempting silent sign-in');
            const token = await chrome.identity.getAuthToken({ interactive: false });
            if (token) {
                console.log('Got token silently');
                return await this.handleAuthSuccess(token);
            }
        } catch (error) {
            console.log('Silent sign-in failed:', error);
        }
        return false;
    }

    async signIn() {
        try {
            console.log('Starting interactive sign-in');
            const token = await chrome.identity.getAuthToken({ interactive: true });
            if (!token) {
                throw new Error('Authentication failed');
            }

            return await this.handleAuthSuccess(token);
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleAuthSuccess(token) {
        try {
            console.log('Handling successful authentication');
            // Get user info using the auth token
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token.token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to get user info');
            }

            const userInfo = await response.json();
            console.log('Got user info:', userInfo.email);

            // Store auth state in both storages
            await Promise.all([
                chrome.storage.sync.set({
                    isAuthenticated: true,
                    userEmail: userInfo.email
                }),
                chrome.storage.local.set({
                    isAuthenticated: true,
                    userEmail: userInfo.email
                })
            ]);

            this.isAuthenticated = true;
            this.userEmail = userInfo.email;

            return {
                success: true,
                email: userInfo.email
            };
        } catch (error) {
            console.error('Auth success handler error:', error);
            throw new Error('Failed to get user info: ' + error.message);
        }
    }

    async signOut() {
        try {
            console.log('Starting sign-out process');
            // Get current token
            const token = await chrome.identity.getAuthToken({ interactive: false });

            if (token) {
                // Revoke token
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token.token}`);
                // Remove from cache
                await chrome.identity.removeCachedAuthToken({ token: token.token });
            }

            // Only remove auth state, preserve license data
            const keysToRemove = ['userEmail', 'isAuthenticated'];
            await Promise.all([
                chrome.storage.sync.remove(keysToRemove),
                chrome.storage.local.remove(keysToRemove)
            ]);

            this.isAuthenticated = false;
            this.userEmail = null;

            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            // Even if there's an error, clear local state
            this.isAuthenticated = false;
            this.userEmail = null;

            // Only remove auth state, preserve license data
            const keysToRemove = ['userEmail', 'isAuthenticated'];
            await Promise.all([
                chrome.storage.sync.remove(keysToRemove),
                chrome.storage.local.remove(keysToRemove)
            ]);

            return {
                success: false,
                error: error.message
            };
        }
    }

    async getAuthState() {
        console.log('Getting auth state');
        const isAuthenticated = await this.checkAuthState();
        console.log('Auth state:', { isAuthenticated, userEmail: this.userEmail });

        return {
            isAuthenticated: this.isAuthenticated,
            userEmail: this.userEmail
        };
    }
}

const authHandler = new AuthHandler();
export default authHandler;