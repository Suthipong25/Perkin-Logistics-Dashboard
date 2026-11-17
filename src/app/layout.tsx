import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perkin Logistics — Operations & Shipment Control Hub",
  description:
    "ระบบศูนย์ควบคุมสถานะงานขนส่งและโลจิสติกส์ บริษัท เพอร์กิ้น โลจิสติคส์ (ประเทศไทย) จำกัด · FWD → Graph Excel API → Web Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
