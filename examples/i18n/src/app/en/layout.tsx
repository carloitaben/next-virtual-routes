const route = {
  "filename": "/Users/carloitaben/Developer/next-virtual-routes/examples/i18n/src/app/en/layout.tsx",
  "context": {
    "language": "en"
  }
}

import type { Metadata } from "next"
import "@/globals.css"

export const metadata: Metadata = {
  title: "en",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang={"en"}>
      <body>
        <h1>Language: {"en"}</h1>
        {children}
      </body>
    </html>
  )
}
