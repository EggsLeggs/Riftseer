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
        id: 'supabase',
        path: '../supabase/docs',
        routeBasePath: 'supabase',
        sidebarPath: './sidebarsSupabase.ts',
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
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'ingestWorkerSidebar',
          position: 'left',
          label: 'Ingest worker',
        },
        {
          type: 'doc',
          docId: 'supabase',
          docsPluginId: 'supabase',
          position: 'left',
          label: 'Supabase',
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
