
/**
 * AVO Authentication Service (Restored)
 * Tập trung vào bảo mật Token và Session cho tính năng Đăng nhập/Đăng ký
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
  // TODO: Sau này sẽ thêm API call để kiểm tra token với Server thật
  return true;
};
