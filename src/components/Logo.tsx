import logo from "@/assets/trax-logo.png";
import logoLight from "@/assets/TraX_white.png";
import { useTheme } from "@/lib/theme";

export function Logo({ className = "h-10 w-auto" }) {
  const { theme } = useTheme();
  const src = theme === "light" ? logoLight : logo;
  return <img src={src} alt="TraX" className={className} draggable={false} />;
}
