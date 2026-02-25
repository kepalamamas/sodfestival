# SOD Festival - Vite Setup

This project is now configured with Vite for development and production builds.

## Available Commands

### Development
```bash
npm run dev
```
- Starts local development server at http://localhost:3000
- Hot module replacement (HMR) enabled
- Automatically opens browser

### Production Build
```bash
npm run build
```
- Creates optimized production build in `/dist` folder
- Minifies HTML, CSS, and optimizes assets
- Ready to deploy

### Preview Production Build
```bash
npm run preview
```
- Preview the production build locally before deployment
- Runs at http://localhost:4173 by default

## Project Structure

- Source files remain in root directory
- Build output goes to `/dist` folder
- All assets (images, fonts, libraries) are automatically optimized

## Deployment

After running `npm run build`, deploy the contents of the `/dist` folder to your web server or hosting platform:

- **Static Hosting**: Upload `/dist` folder contents
- **GitHub Pages**: Deploy `/dist` folder
- **Netlify/Vercel**: Point to `/dist` as publish directory

## Notes

- The original HTML structure is preserved
- All existing libraries (jQuery, Bootstrap, etc.) work as-is
- Source maps warnings for minified libraries are normal and harmless
- CNAME and robots.txt in root should be copied to dist for deployment

## First Time Setup

1. Make sure Node.js is installed
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start development

## What Was Changed

- Added `package.json` with Vite configuration
- Added `vite.config.js` for build settings
- Moved Facebook Pixel noscript tag to body (HTML5 compliance)
- All other files remain unchanged
