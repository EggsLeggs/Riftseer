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
          path: './doc-pages/getting-started',
          sidebarPath: './sidebarsGettingStarted.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/EggsLeggs/Riftseer/edit/main/docs/doc-pages/getting-started/',
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
        id: 'ingest-worker',
        path: '../packages/ingest-worker/docs',
        routeBasePath: 'ingest-worker',
        sidebarPath: './sidebarsIngestWorker.ts',
        editUrl: 'https://github.com/EggsLeggs/Riftseer/edit/main/packages/ingest-worker/docs/',
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
        path: './doc-pages/clients-bots',
        routeBasePath: 'bots',
        sidebarPath: './sidebarsBots.ts',
        editUrl: ({docPath}) => {
          const base = 'https://github.com/EggsLeggs/Riftseer/edit/main/';
          if (docPath === 'discord-bot.md') {
            return `${base}packages/discord-bot/docs/discord-bot.md`;
          }
          if (docPath === 'reddit-bot.md') {
            return `${base}packages/reddit-bot/docs/reddit-bot.md`;
          }
          return `${base}docs/doc-pages/clients-bots/${docPath}`;
        },
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
        path: './doc-pages/infrastructure',
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
        href: '/',
      },
      items: [
        {
          type: 'doc',
          docId: 'index',
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
          docId: 'index',
          docsPluginId: 'bots',
          position: 'left',
          label: 'Clients & Bots',
        },
        {
          type: 'doc',
          docId: 'index',
          docsPluginId: 'ingest-worker',
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
