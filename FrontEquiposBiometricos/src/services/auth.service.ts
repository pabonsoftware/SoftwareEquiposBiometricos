import { api } from "@/lib/api";
import type { LoginRequest, LoginResponse, Usuario } from "@/types/auth";

export const authService = {
  async login(data: LoginRequest) {
    const res = await api.post<LoginResponse>("/auth/token/", data);
    return res.data;
  },
  async me() {
    const res = await api.get<Usuario>("/users/me/");
    return res.data;
  },
};
