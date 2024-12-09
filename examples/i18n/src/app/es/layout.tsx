const context = {
  "language": "es"
}

import type { Metadata } from "next"
import "@/globals.css"

export const metadata: Metadata = {
  "title": "es"
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang={context.language}>
      <body>
        <h1>Language: {context.language}</h1>
        {children}
      </body>
    </html>
  )
}
