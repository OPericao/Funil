import type { ReactNode } from "react";
import { appCenterClass, appShellClass } from "../ui/styles";

const fondoCentroBackgroundUrl = new URL("../../assets/fondocentro.jpg", import.meta.url).href;

type AuthCardLayoutProps = {
  children: ReactNode;
};

export function AuthCardLayout({ children }: AuthCardLayoutProps) {
  return (
    <section className={appShellClass} style={{ backgroundImage: `url(${fondoCentroBackgroundUrl})` }}>
      <section className={appCenterClass}>{children}</section>
    </section>
  );
}
