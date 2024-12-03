const route = {
  "filename": "/Users/carloitaben/Developer/next-virtual-routes/examples/i18n/src/app/es/layout.tsx",
  "context": {
    "language": "es"
  }
}

import type { Metadata } from "next"
import "@/globals.css"

export const metadata: Metadata = {
  title: "es",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang={"es"}>
      <body>
        <h1>Language: {"es"}</h1>
        {children}
      </body>
    </html>
  )
}
