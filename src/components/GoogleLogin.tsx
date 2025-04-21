import React, { useEffect, useState } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import '../auth.css';

interface GoogleLoginProps {
  onLoginSuccess: (userData: any) => void;
  onLoginFailure: (error: any) => void;
}

interface TokenResponse {
  access_token: string;
  [key: string]: any;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const GoogleLoginButton: React.FC<GoogleLoginProps> = ({ onLoginSuccess, onLoginFailure }) => {
  const [isLoading, setIsLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse: TokenResponse) => {
      setIsLoading(true);
      try {
        // Fetch user info from Google API
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
          },
        });
        const userInfo = await userInfoResponse.json();
        onLoginSuccess({ ...userInfo, token: tokenResponse.access_token });
      } catch (error: unknown) {
        onLoginFailure(error);
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error: unknown) => {
      onLoginFailure(error);
      setIsLoading(false);
    },
  });

  return (
    <button 
      onClick={() => login()} 
      className="google-login-button"
      disabled={isLoading}
    >
      {isLoading ? 'Logging in...' : 'Login with Google'}
    </button>
  );
};

const GoogleLogin: React.FC<GoogleLoginProps> = (props) => {
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleLoginButton {...props} />
    </GoogleOAuthProvider>
  );
};

export default GoogleLogin; 