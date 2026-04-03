
/**
 * AVO Authentication Service (Restored)
 * Tập trung vào bảo mật Token và Session cho tính năng Đăng nhập/Đăng ký
 */


const TOKEN_KEY = 'avo_auth_token';
const USER_KEY = 'avo_auth_user';

export const storeToken = (token: string, rememberMe = false) => {
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
};

export const storeUser = (user: { id: string, username: string, email?: string, currentRoom?: string, avatar?: string }, rememberMe = false) => {
  try {
    const val = JSON.stringify(user);
    if (rememberMe) {
      localStorage.setItem(USER_KEY, val);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(USER_KEY, val);
      localStorage.removeItem(USER_KEY);
    }
  } catch (err) {
    console.warn('Storage warning (auth):', err);
  }
};

export const getUser = () => {
  const u = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
};

export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.location.reload();
};

export const validateSession = () => {
  return !!getToken();
};

// --- Real Authentication Logic (Connected to MongoDB) ---

export const register = async (email: string, username: string, password: string): Promise<void> => {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password })
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error('Máy chủ gặp lỗi hoặc không trả về dữ liệu chuẩn');
  }
  if (!res.ok) throw new Error(data.error || 'Registration failed');
};

export const login = async (email: string, password: string, rememberMe = false): Promise<{ token: string, user: { id: string, email: string, username: string, currentRoom?: string, avatar?: string } }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error('Máy chủ gặp lỗi hoặc không trả về dữ liệu chuẩn');
  }

  if (!res.ok) throw new Error(data.error || 'Login failed');

  storeToken(data.token, rememberMe);
  storeUser({ id: data.user.id, email: data.user.email, username: data.user.username, currentRoom: data.user.currentRoom, avatar: data.user.avatar }, rememberMe);
  return { token: data.token, user: { id: data.user.id, email: data.user.email, username: data.user.username, currentRoom: data.user.currentRoom, avatar: data.user.avatar } };
};

// --- OTP Logic ---
export const requestOtp = async (email: string) => {
  const res = await fetch('/api/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send code');
  return data;
};

export const confirmOtp = async (email: string, code: string) => {
  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to verify code');
  return true;
};

export const forgotPassword = async (email: string) => {
  const res = await fetch('/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send code');
  return true;
};

export const resetPassword = async (email: string, code: string, newPassword: string) => {
  const res = await fetch('/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset password');
  return true;
};

// --- Profile Management ---

export const updateProfile = async (userId: string, avatar: string): Promise<any> => {
  const res = await fetch('/api/user/update-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, avatar })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);

  // Update local session
  const currentUser = getUser();
  if (currentUser) {
    storeUser({ ...currentUser, avatar: data.user.avatar });
  }
  return data.user;
};

export const changePassword = async (userId: string, oldPassword: string, newPassword: string) => {
  const res = await fetch('/api/user/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, oldPassword, newPassword })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const requestEmailChange = async (userId: string, password: string, newEmail: string) => {
  const res = await fetch('/api/user/request-email-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password, newEmail })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};

export const verifyEmailChange = async (userId: string, newEmail: string, code: string) => {
  const res = await fetch('/api/user/verify-email-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, newEmail, code })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);

  // Update local session email
  const currentUser = getUser();
  if (currentUser) {
    storeUser({ ...currentUser, email: newEmail });
  }
  return data;
};

export const getMeetingHistory = async (userId: string) => {
  const token = getToken();
  const res = await fetch(`/api/user/meetings/${userId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get meeting history");
  return data;
};
