import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    rol?: string;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      rol?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    rol?: string;
  }
}
