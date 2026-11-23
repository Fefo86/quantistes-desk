import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return <Html lang="it" className="quantistes" data-access="wordpress">
    <Head>
      <meta httpEquiv="Content-Security-Policy" content="connect-src 'self' blob: data:" />
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content="#08090a" />
      <meta name="robots" content="noindex,nofollow" />
      <link rel="icon" type="image/svg+xml" href="/quantistes.svg" />
      <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/ui-fonts/ibm-plex-mono-latin-400-normal.woff2" />
    </Head>
    <body><Main /><div id="qt-runtime-slot"></div><NextScript /></body>
  </Html>;
}
