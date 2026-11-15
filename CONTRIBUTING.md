# Contributing to OrthoSculpt CAD

Thank you for your interest in contributing to OrthoSculpt CAD! We welcome contributions from developers, prosthetists, biomechanics researchers, and 3D geometry enthusiasts.

## Code of Conduct
We strive to provide a welcoming, respectful, and collaborative environment for all contributors.

## How to Contribute

### Reporting Bugs & Requesting Features
- Check existing [GitHub Issues](https://github.com/mikelos151/OrthoSculptCAD/issues) before opening a new issue.
- Provide clear steps to reproduce bugs, including sample mesh formats (STL/PLY/OBJ) and browser/Node environment details.

### Development Workflow
1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/mikelos151/OrthoSculptCAD.git
   cd OrthoSculptCAD
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the local development server**:
   ```bash
   npm run dev
   ```
4. **Run the test suite**:
   ```bash
   npm test
   ```
   Ensure all unit and geometric verification tests pass before submitting a Pull Request.

### Pull Request Guidelines
- Keep PRs focused on a single bug fix, performance optimization, or feature.
- Maintain local-first guarantees: never introduce external telemetry, tracking, or mandatory remote cloud dependencies.
- Ensure full type safety with `npm run build` (`tsc -b && vite build`).
