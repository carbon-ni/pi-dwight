.PHONY: lint typecheck test check all clean

# ── Quality gates ──

lint:
	npx eslint 'index.ts' 'src/**/*.ts'

typecheck:
	npx tsc --noEmit

test:
	npx vitest run --reporter=verbose

check: lint typecheck test
	@echo "✓ All quality gates passed"

all: check

clean:
	rm -rf dist coverage .tmp
