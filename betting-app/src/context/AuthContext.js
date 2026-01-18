
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
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }

        const data = await response.json();
        localStorage.setItem('viva_token', data.access_token);
        setToken(data.access_token);
        await checkAuth(); // Get user details immediately
        return true;
    };

    const register = async (username, email, password) => {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Registration failed');
        }

        const data = await response.json();
        localStorage.setItem('viva_token', data.access_token);
        setToken(data.access_token);
        await checkAuth();
        return true;
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
