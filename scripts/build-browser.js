const esbuild = require('esbuild');
const path = require('path');

async function build() {
    try {
        await esbuild.build({
            entryPoints: [path.join(__dirname, '../src/browser/index.ts')],
            bundle: true,
            outfile: path.join(__dirname, '../public/r2-bundle.js'),
            format: 'iife',
            platform: 'browser',
            target: ['es2020'],
            minify: true,
            sourcemap: false,
            define: {
                'process.env.NODE_ENV': '"production"',
                'global': 'window',
            },
            // Handle node built-ins for browser
            alias: {
                'stream': 'stream-browserify',
                'buffer': 'buffer',
                'util': 'util',
            },
            // Inject necessary polyfills
            inject: [],
            // External packages that should not be bundled
            external: [],
        });
        console.log('✅ Browser bundle built successfully: public/r2-bundle.js');
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
