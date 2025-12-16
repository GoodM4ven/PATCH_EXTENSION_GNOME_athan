#=============================================================================
NAME=athan
UUID=$(NAME)@goodm4ven
BUILDDIR=build
INSTALL_PATH=~/.local/share/gnome-shell/extensions
#=============================================================================
default_target: all
.PHONY: clean all zip install reloadGnome check lint pot uninstall 

clean:
	@if [ -d $(BUILDDIR) ]; then \
		rm -rf $(BUILDDIR); \
	fi
	@if [ -d po/mo ]; then \
		rm -rf po/mo; \
	fi
	@echo "+ Clean done"

check:
	@echo "Checking prerequisites..."
	@command -v zip >/dev/null 2>&1 || { echo >&2 "zip is not installed. Aborting."; exit 1; }
	@command -v eslint >/dev/null 2>&1 || { echo >&2 "ESLint is not installed. Aborting."; exit 1; }
	@echo "Done."

# ? Lints JavaScript files if the [src] directory exists
lint: check
	@if [ -d src ]; then \
		node_modules/.bin/eslint src/**/*.js; \
	else \
		echo "Warning: src directory does not exist. Skipping linting."; \
	fi

# ? Builds the extension
all: clean pot
	@if [ -d src ]; then \
		mkdir -p $(BUILDDIR)/$(UUID); \
		cp src/*.js $(BUILDDIR)/$(UUID)/ || echo "Warning: No JS files found in src."; \
		cp src/*.css $(BUILDDIR)/$(UUID)/ || echo "Warning: No CSS files found in src."; \
		if [ -f src/metadata.json ]; then \
			cp src/metadata.json $(BUILDDIR)/$(UUID)/; \
		else \
			echo "Error: metadata.json is missing."; \
			exit 1; \
		fi; \
	else \
		echo "Error: src directory does not exist. Cannot build the extension."; \
		exit 1; \
	fi
	@if [ -d schemas ]; then \
		cp -r schemas $(BUILDDIR)/$(UUID)/; \
	fi
	@if [ -d po/mo ]; then \
		for lang in $$(cat po/mo/LINGUAS); do \
			mkdir -p $(BUILDDIR)/$(UUID)/locale/$$lang/LC_MESSAGES; \
			cp po/mo/$$lang.mo $(BUILDDIR)/$(UUID)/locale/$$lang/LC_MESSAGES/$(UUID).mo || echo "Warning: Missing translation file for $$lang."; \
		done; \
	fi
	@if [ -d .github/images ]; then \
		cp -r .github/images $(BUILDDIR)/$(UUID)/images; \
	else \
		echo "Warning: .github/images directory does not exist. Skipping images."; \
	fi
	@echo "+ Build done"

# ? Creates a ZIP file for the GNOME extension
zip: all
	@if [ -d $(BUILDDIR)/$(UUID) ]; then \
		cd $(BUILDDIR)/$(UUID) && \
		gnome-extensions pack -f \
			--extra-source=schemas \
			--extra-source=locale \
			--extra-source=HijriCalendarKuwaiti.js \
			--extra-source=PrayTimes.js \
			--extra-source=stylesheet.css \
			--out-dir=../; \
		echo "+ Initial zip creation done"; \
		echo "+ Final zip file fixed"; \
	else \
		echo "Error: Build directory does not exist. Cannot create ZIP."; \
		exit 1; \
	fi

# ? Uninstalls the extension
uninstall:
	@if [ -d $(INSTALL_PATH)/$(UUID) ]; then \
		rm -rf $(INSTALL_PATH)/$(UUID); \
		echo "+ Uninstallation done"; \
	else \
		echo "Warning: Extension is not installed."; \
	fi

# ? Installs the extension
install: uninstall zip
	@if [ -f $(BUILDDIR)/$(UUID).shell-extension.zip ]; then \
		gnome-extensions install -f $(BUILDDIR)/$(UUID).shell-extension.zip; \
		echo "+ Installation done"; \
	else \
		echo "Error: ZIP file does not exist. Cannot install."; \
		exit 1; \
	fi

# ? Reloads GNOME Shell
reloadGnome:
	@dbus-send --type=method_call --print-reply --dest=org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Eval string:'global.reexec_self()' || \
	{ echo "Failed to reload GNOME Shell. Please restart it manually."; exit 1; }

# ? Updates translation files if translation directory exists
pot:
	@if [ -d po ]; then \
		if ! command -v msginit >/dev/null 2>&1 || ! command -v msgmerge >/dev/null 2>&1 || ! command -v msgfmt >/dev/null 2>&1; then \
			echo "Error: gettext tools (msginit, msgmerge, msgfmt) are required. Install gettext to update translations."; \
			exit 1; \
		fi; \
		rm -f po/LINGUAS; \
		for l in $$(ls po/*.po); do basename $$l .po >> po/LINGUAS; done; \
		mkdir -p po/mo; \
		cp po/LINGUAS po/mo/LINGUAS; \
		cd po && \
		for lang in $$(cat LINGUAS); do \
			cp $${lang}.po $${lang}.po.bak; \
			if ! msginit --no-translator --locale=$$lang --input $(UUID).pot -o $${lang}.po.new >/dev/null; then \
				echo "Error: Failed to initialize $$lang translation. Restoring original file."; \
				mv $${lang}.po.bak $${lang}.po; \
				rm -f $${lang}.po.new; \
				exit 1; \
			fi; \
			if ! msgmerge -N $${lang}.po.bak $${lang}.po.new -o $${lang}.po; then \
				echo "Error: Failed to merge $$lang translation. Restoring original file."; \
				mv $${lang}.po.bak $${lang}.po; \
				rm -f $${lang}.po.new; \
				exit 1; \
			fi; \
			if ! msgfmt -o mo/$${lang}.mo $${lang}.po; then \
				echo "Error: Failed to compile $$lang translation. Restoring original file."; \
				mv $${lang}.po.bak $${lang}.po; \
				rm -f $${lang}.po.new mo/$${lang}.mo; \
				exit 1; \
			fi; \
			rm -f $${lang}.po.bak $${lang}.po.new; \
		done; \
		echo "+ POT file generation done"; \
	else \
		echo "Warning: po directory does not exist. Skipping translation updates."; \
	fi
