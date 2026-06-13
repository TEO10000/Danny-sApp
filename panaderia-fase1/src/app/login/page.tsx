import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

async function ingresar(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error; // los redirects de Next viajan como excepción
  }
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      {/* Marca: el "sol de horno" — medio círculo que asoma como pan en el horno */}
      <div className="mb-8 flex flex-col items-center">
        <div
          aria-hidden
          className="h-10 w-20 rounded-t-full bg-horno-500"
        />
        <div aria-hidden className="h-1 w-28 rounded-full bg-corteza-800" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-corteza-900">
          Panadería
        </h1>
        <p className="mt-1 text-sm text-corteza-400">
          Gestión interna · Principal y Consejo
        </p>
      </div>

      <form
        action={ingresar}
        className="w-full max-w-sm rounded-panel border border-masa-200 bg-white p-6 shadow-sm"
      >
        {searchParams.error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal"
          >
            Correo o contraseña incorrectos. Revisa e intenta de nuevo.
          </p>
        )}

        <label className="block text-sm font-semibold text-corteza-800" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          inputMode="email"
          className="mt-1.5 w-full rounded-lg border border-masa-200 bg-masa-50 px-3.5 py-3 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
          placeholder="tu@correo.com"
        />

        <label
          className="mt-4 block text-sm font-semibold text-corteza-800"
          htmlFor="password"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-lg border border-masa-200 bg-masa-50 px-3.5 py-3 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
          placeholder="••••••••"
        />

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-horno-500 px-4 py-3.5 text-touch-lg text-white transition-colors hover:bg-horno-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-horno-600 active:bg-horno-600"
        >
          Entrar
        </button>
      </form>

      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-corteza-400">
        Tu cuenta define lo que ves: caja, producción o administración. Si no
        puedes entrar, pide al administrador que revise tu usuario.
      </p>
    </main>
  );
}
