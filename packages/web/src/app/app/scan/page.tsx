import type { Metadata } from "next";
import { QrScanner } from "@/components/mobile/QrScanner";
import { RoomCodeForm } from "@/components/mobile/RoomCodeForm";

export const metadata: Metadata = { title: "Scan room" };

export default function ScanPage() {
  return (
    <div className="m-stack">
      <section>
        <h1 className="m-h1">Scan room</h1>
        <p className="muted">Hold the phone a hand's width from the door sign.</p>
      </section>
      <QrScanner />
      <div>
        <p className="m-or">or type the code under the QR</p>
        <RoomCodeForm />
      </div>
    </div>
  );
}
