.PHONY: lint typecheck build build-libs build-all docs verify test test-stable test-update test-ui test-codegen dev clean cache images

CONCURRENTLY := npx concurrently
RIMRAF := npx rimraf

APP ?= gallery
STABLE_TEST ?= tests/gallery/autk-map/colormap-categorical.test.ts

lint:
	npm run lint

typecheck:
	$(CONCURRENTLY) \
		"cd autk-core && npx tsc --noEmit --skipLibCheck" \
		"cd autk-map && npx tsc --noEmit --skipLibCheck" \
		"cd autk-db && npx tsc --noEmit --skipLibCheck" \
		"cd autk-plot && npx tsc --noEmit --skipLibCheck" \
		"cd autk-compute && npx tsc --noEmit --skipLibCheck" \
		"cd autk && npx tsc --noEmit --skipLibCheck" \
		"cd gallery && npx tsc --noEmit --skipLibCheck" \
		"cd usecases && npx tsc --noEmit --skipLibCheck"

build-libs:
	$(CONCURRENTLY) \
		"cd autk-map && npm run build" \
		"cd autk-db && npm run build" \
		"cd autk-plot && npm run build" \
		"cd autk-compute && npm run build"

build: build-libs
	cd autk && npm run build

build-all: build

docs:
	$(CONCURRENTLY) \
		"cd autk-map && npm run doc" \
		"cd autk-db && npm run doc" \
		"cd autk-plot && npm run doc" \
		"cd autk-compute && npm run doc"

verify: lint typecheck build

ifdef OPEN
TEST_TARGET = tests/$(APP)/$(shell echo '$(OPEN)' | sed 's|^/||' | sed 's|^src/||' | sed 's|/$$||' | sed 's|\.[^./]*$$||')
else
TEST_TARGET = tests/$(APP)
endif

CODEGEN_TARGET = src/$(shell echo '$(OPEN)' | sed 's|^/||' | sed 's|^src/||' | sed 's|/$$||' | sed 's|\.[^./]*$$||')

test:
	APP=$(APP) OPEN=$(OPEN) npx playwright test $(if $(OPEN),$(TEST_TARGET).test.ts,$(TEST_TARGET))

test-stable:
	APP=gallery npx playwright test $(STABLE_TEST)

# make test-update               → update both cache (HAR) and images (snapshots)
# make test-update cache         → update HAR files only
# make test-update images        → update snapshots only
# make test-update cache images  → update both explicitly
_CACHE  := $(filter cache,$(MAKECMDGOALS))
_IMAGES := $(filter images,$(MAKECMDGOALS))
_BOTH   := $(if $(or $(_CACHE),$(_IMAGES)),,1)

test-update:
	APP=$(APP) OPEN=$(OPEN) \
	$(if $(or $(_CACHE),$(_BOTH)),HAR_UPDATE=1) \
	npx playwright test $(if $(OPEN),$(TEST_TARGET).test.ts,$(TEST_TARGET)) \
	$(if $(or $(_IMAGES),$(_BOTH)),--update-snapshots)

cache images:
	@true

test-ui:
	APP=$(APP) OPEN=$(OPEN) npx playwright test --ui $(if $(OPEN),$(TEST_TARGET).test.ts,$(TEST_TARGET))

test-codegen:
	node playwright.codegen.mjs http://localhost:5173$(OPEN) $(if $(OPEN),$(TEST_TARGET).test.ts)

dev:
	npm install
	make build
	$(CONCURRENTLY) \
		"cd autk-map && npm run dev-build" \
		"cd autk-db && npm run dev-build" \
		"cd autk-plot && npm run dev-build" \
		"cd autk-compute && npm run dev-build" \
		"cd autk && npm run dev-build" \
		"cd $(APP) && VITE_OPEN=\"$(OPEN)\" npm run dev"

clean:
	$(RIMRAF) node_modules
	$(CONCURRENTLY) \
		"cd autk-map && $(RIMRAF) dist build" \
		"cd autk-db && $(RIMRAF) dist build" \
		"cd autk-plot && $(RIMRAF) dist build" \
		"cd autk-compute && $(RIMRAF) dist build" \
		"cd autk && $(RIMRAF) dist build" \
		"cd gallery && $(RIMRAF) dist build" \
		"cd usecases && $(RIMRAF) dist build"
