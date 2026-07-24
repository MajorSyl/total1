import "./globals.css";

export const metadata = {
  title: "Mall Expiry Tracker",
  description: "Product expiry monitoring dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
