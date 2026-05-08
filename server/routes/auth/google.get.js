export default defineOAuthGoogleEventHandler({
  config: {
    scope: ['openid', 'email', 'profile'],
  },
  async onSuccess(event, { user }) {
    await setUserSession(event, {
      user: {
        email: user.email,
        name: user.name,
        avatar: user.picture,
      },
    });
    return sendRedirect(event, '/');
  },
  onError(event, error) {
    console.error('[Auth] Google OAuth error:', error);
    return sendRedirect(event, '/');
  },
});
