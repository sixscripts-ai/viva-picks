
import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('viva_token'));
    const [loading, setLoading] = useState(true);

    // Helper to check if token is valid and set user state
    const checkAuth = async () => {
        const storedToken = localStorage.getItem('viva_token');
        if (storedToken) {
            try {
                const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${storedToken}`
                    }
                });

                if (response.ok) {
                    const userData = await response.json();
                    setUser(userData);
                    setToken(storedToken);
                } else {
                    logout();
                }
            } catch (error) {
                logout();
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        checkAuth();
    }, []);

    const login = async (username, password) => {
        console.log("Attempting login for:", username);
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        try {
            console.log(`Connecting to: ${process.env.REACT_APP_BACKEND_URL}/api/token`);
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
            });

            console.log("Login response status:", response.status);

            if (!response.ok) {
                let errorMessage = 'Login failed';
                try {
                    const errorData = await response.json();
                    console.log("Login error data:", errorData);
                    if (typeof errorData.detail === 'string') {
                        errorMessage = errorData.detail;
                    } else if (Array.isArray(errorData.detail)) {
                        errorMessage = errorData.detail.map(err => err.msg).join(', ');
                    }
                } catch (e) {
                    console.error("Login parsing error:", e);
                    // Fallback to status text if JSON parsing fails
                    errorMessage = `Server Error (${response.status}): ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            localStorage.setItem('viva_token', data.access_token);
            setToken(data.access_token);
            await checkAuth();
            return true;
        } catch (error) {
            console.error("Login exception:", error);
            throw error;
        }
    };

    const register = async (username, email, password) => {
        console.log("Attempting register for:", username);
        try {
            console.log(`Connecting to: ${process.env.REACT_APP_BACKEND_URL}/api/register`);
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            console.log("Register response status:", response.status);

            if (!response.ok) {
                let errorMessage = 'Registration failed';
                try {
                    const errorData = await response.json();
                    console.log("Register error data:", errorData);
                    if (typeof errorData.detail === 'string') {
                        errorMessage = errorData.detail;
                    } else if (Array.isArray(errorData.detail)) {
                        errorMessage = errorData.detail.map(err => err.msg).join(', ');
                    }
                } catch (e) {
                    console.error("Register parsing error:", e);
                    errorMessage = `Server Error (${response.status}): ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            localStorage.setItem('viva_token', data.access_token);
            setToken(data.access_token);
            await checkAuth();
            return true;
        } catch (error) {
            console.error("Register exception:", error);
            throw error;
        }
    };



    const logout = () => {
        localStorage.removeItem('viva_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
