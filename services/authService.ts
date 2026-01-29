
/**
 * AVO Authentication Service
 * Tập trung vào bảo mật Token và Session
 */

export const storeToken = (token: string) => {
  // Sử dụng HttpOnly Cookie là tốt nhất, nhưng ở client-side 
  // chúng ta thường lưu vào sessionStorage để tránh XSS persistent
  sessionStorage.setItem('avo_auth_token', token);
};

export const getToken = () => {
  return sessionStorage.getItem('avo_auth_token');
};

export const clearSession = () => {
  sessionStorage.removeItem('avo_auth_token');
  window.location.reload();
};

export const validateSession = () => {
  const token = getToken();
  if (!token) return false;
  // Giả lập kiểm tra hết hạn JWT
  return true; 
};
