import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { dts } from 'rollup-plugin-dts';
import terser from '@rollup/plugin-terser';
import pkg from './package.json' assert { type: 'json' };

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: pkg.module,
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        rootDir: 'src', // Ensure declaration output is based on 'src'
        exclude: ['**/__tests__/**/*', '**/__benchmark__/**/*'], // Exclude test and benchmark files from build compilation
      }),
      terser() // Add terser for minification
    ],
   
    external: Object.keys(pkg.devDependencies || {}),
  },
  {
    input: 'dist/types/index.d.ts', 
    output: [{ file: pkg.types, format: 'esm' }],
    plugins: [dts()],
  },
];