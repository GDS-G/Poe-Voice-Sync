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
        // Browser profile identity cannot be revoked by an extension. Requiring
        // an explicit click here ensures that signing out remains meaningful.
        return false;
    }

    async signIn() {
        try {
            console.log('Reading the signed-in Chromium browser profile');
            const profile = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
            const email = profile?.email?.trim().toLowerCase();
            if (!email) {
                throw new Error('Sign in to your Chrome or Edge browser profile, then try again.');
            }
            return await this.handleAuthSuccess(email);
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleAuthSuccess(email) {
        try {
            // Store auth state in both storages
            await Promise.all([
                chrome.storage.sync.set({
                    isAuthenticated: true,
                    userEmail: email
                }),
                chrome.storage.local.set({
                    isAuthenticated: true,
                    userEmail: email
                })
            ]);

            this.isAuthenticated = true;
            this.userEmail = email;

            return {
                success: true,
                email
            };
        } catch (error) {
            console.error('Auth success handler error:', error);
            throw new Error('Failed to store browser profile information: ' + error.message);
        }
    }

    async signOut() {
        try {
            console.log('Starting sign-out process');
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
