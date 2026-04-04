import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Riftseer Dev Docs',
  tagline: 'Riftbound TCG API, frontend, and workers',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: 'https://eggsleggs.github.io',
  baseUrl: '/Riftseer/',

  organizationName: 'EggsLeggs',
  projectName: 'Riftseer',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          // Point directly at the ingest worker docs in the monorepo.
          // This avoids symlink-related issues while still keeping docs
          // co-located with the package.
          path: '../packages/ingest-worker/docs',
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/EggsLeggs/Riftseer/edit/main/packages/ingest-worker/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'getting-started',
        path: '../getting-started/docs',
        routeBasePath: 'getting-started',
        sidebarPath: './sidebarsGettingStarted.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: '../packages/api/docs',
        routeBasePath: 'api',
        sidebarPath: './sidebarsApi.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'frontend',
        path: '../packages/frontend/docs',
        routeBasePath: 'frontend',
        sidebarPath: './sidebarsFrontend.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'core',
        path: '../packages/core/docs',
        routeBasePath: 'core',
        sidebarPath: './sidebarsCore.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'bots',
        path: '../bots/docs',
        routeBasePath: 'bots',
        sidebarPath: './sidebarsBots.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'supabase',
        path: '../supabase/docs',
        routeBasePath: 'supabase',
        sidebarPath: './sidebarsSupabase.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'infrastructure',
        path: '../infrastructure/docs',
        routeBasePath: 'infrastructure',
        sidebarPath: './sidebarsInfrastructure.ts',
      },
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Riftseer',
      logo: {
        alt: 'Riftseer Logo',
        src: 'img/logo.svg',
        href: '/getting-started',
      },
      items: [
        {
          type: 'doc',
          docId: 'index',
          docsPluginId: 'getting-started',
          position: 'left',
          label: 'Getting Started',
        },
        {
          type: 'doc',
          docId: 'index',
          docsPluginId: 'api',
          position: 'left',
          label: 'API',
        },
        {
          type: 'doc',
          docId: 'index',
          docsPluginId: 'frontend',
          position: 'left',
          label: 'Frontend',
        },
        {
          type: 'doc',
          docId: 'index',
          docsPluginId: 'core',
          position: 'left',
          label: 'Core',
        },
        {
          type: 'doc',
          docId: 'discord-bot',
          docsPluginId: 'bots',
          position: 'left',
          label: 'Clients & Bots',
        },
        {
          type: 'docSidebar',
          sidebarId: 'ingestWorkerSidebar',
          position: 'left',
          label: 'Ingest Worker',
        },
        {
          type: 'doc',
          docId: 'supabase',
          docsPluginId: 'supabase',
          position: 'left',
          label: 'Supabase',
        },
        {
          type: 'doc',
          docId: 'cloudflare',
          docsPluginId: 'infrastructure',
          position: 'left',
          label: 'Infrastructure',
        },
        {
          href: 'https://github.com/EggsLeggs/Riftseer',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} Riftseer. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
