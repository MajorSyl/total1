import "./globals.css";

export const metadata = {
  title: "Total Mundo",
  description: "Control de fechas de vencimiento — Total Mundo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
