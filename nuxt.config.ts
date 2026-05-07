// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false, // We don't like SSR over here
  devtools: { enabled: true },

  // Add individual Nuxt SEO modules & our new Auth module
  modules: [
    '@nuxtjs/sitemap',
    '@vueuse/nuxt',
    'nuxt-auth-utils'
  ],

  // Performance optimizations
  experimental: {
    payloadExtraction: false, // Disable if not needed since SSR is off
  },

  // Site configuration for SEO modules
  site: {
    url: 'http://localhost:3000', // Swapped to local dev for now
    name: 'Nimbus',
    description: 'Cloudsail Nimbus AI Assistant',
    defaultLocale: 'en',
  },

  sitemap: {
    enabled: true,
  },

  app: {
    head: {
      title: 'Nimbus',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Cloudsail Nimbus AI Assistant' },
        { name: 'theme-color', content: '#7c3aed' }, // Nimbus Violet
        { name: 'format-detection', content: 'telephone=no' },

        // SEO and social media meta tags
        { name: 'application-name', content: 'Nimbus' },
        { name: 'apple-mobile-web-app-title', content: 'Nimbus' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:url', content: 'http://localhost:3000' },
        { name: 'twitter:title', content: 'Nimbus' },
        { name: 'twitter:description', content: 'Cloudsail Nimbus AI Assistant' },

        // Open Graph tags for social sharing
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'http://localhost:3000' },
        { property: 'og:title', content: 'Nimbus' },
        { property: 'og:description', content: 'Cloudsail Nimbus AI Assistant' },
        { property: 'og:site_name', content: 'Nimbus' },
        { property: 'og:image', content: '/og-image.png' } 
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=JetBrains+Mono:wght@400;500;600&display=swap' }
      ],
      htmlAttrs: {
        lang: 'en'
      }
    }
  },

  // Optimize build and runtime
  css: [
    // Global CSS files
  ],

  // Optimize modules and features
  features: {
    inlineStyles: true, // For client-side rendered apps
  },

  runtimeConfig: {
    // Private config that only the server can access
    hackclubAiKey: process.env.NUXT_HACKCLUB_AI_KEY || '',
    sessionSecret: process.env.NUXT_SESSION_PASSWORD || '',
    databaseUrl: process.env.DATABASE_URL || '',
    
    // Public config that is exposed to the client
    public: {}
  }
})