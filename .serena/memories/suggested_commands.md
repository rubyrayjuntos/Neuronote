# Suggested Commands for NeuroNote Development

## Development
```bash
# Install dependencies
npm install

# Start dev server (Vite)
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Build
```bash
# Production build
npm run build

# Preview production build
npm run preview
```

## Linting & Formatting
```bash
# Type checking
npx tsc --noEmit

# ESLint (if configured)
npx eslint . --ext .ts,.tsx
```

## Git Workflow
```bash
# Standard commit
git add . && git commit -m "message"

# Push to remote
git push origin main
```

## System Utils (Linux)
- `grep -r "pattern" .` - Search codebase
- `find . -name "*.ts"` - Find TypeScript files
- `cat file | head -50` - Preview file
