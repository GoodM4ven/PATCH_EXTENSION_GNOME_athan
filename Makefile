#=============================================================================
NAME=athan
UUID=$(NAME)@goodm4ven
BUILDDIR=build
INSTALL_PATH=~/.local/share/gnome-shell/extensions
#=============================================================================
default_target: all
.PHONY: clean all zip install reloadGnome check compile-schemas lint pot uninstall 

clean:
	@if [ -d $(BUILDDIR) ]; then \
		rm -rf $(BUILDDIR); \
	fi
	@if [ -d po/mo ]; then \
		rm -rf po/mo; \
	fi
	@if [ -f schemas/gschemas.compiled ]; then \
		rm schemas/gschemas.compiled; \
	fi
	@echo "+ Clean done"

check:
	@echo "Checking prerequisites..."
	@command -v zip >/dev/null 2>&1 || { echo >&2 "glib-compile-schemas is not installed. Aborting."; exit 1; }
	@command -v glib-compile-schemas >/dev/null 2>&1 || { echo >&2 "glib-compile-schemas is not installed. Aborting."; exit 1; }
	@command -v eslint >/dev/null 2>&1 || { echo >&2 "ESLint is not installed. Aborting."; exit 1; }
	@echo "Done."

# ? Compiles the schemas if its directory exists
compile-schemas:
	@if [ -d schemas ]; then \
		glib-compile-schemas schemas; \
	else \
		echo "Warning: schemas directory does not exist. Skipping schema compilation."; \
	fi

# ? Lints JavaScript files if the [src] directory exists
lint: check
	@if [ -d src ]; then \
		node_modules/.bin/eslint src/**/*.js; \
	else \
		echo "Warning: src directory does not exist. Skipping linting."; \
	fi

# ? Builds the extension
all: clean compile-schemas pot
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
		glib-compile-schemas $(BUILDDIR)/$(UUID)/schemas; \
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
			--extra-source=schemas/gschemas.compiled \
			--extra-source=locale \
			--extra-source=images \
			--extra-source=HijriCalendarKuwaiti.js \
			--extra-source=PrayTimes.js \
			--extra-source=stylesheet.css \
			--out-dir=../; \
		echo "+ Initial zip creation done"; \
		# Move gschemas.compiled into the schemas folder inside the zip \
		unzip ../$(UUID).shell-extension.zip -d ../temp_zip; \
		mv ../temp_zip/gschemas.compiled ../temp_zip/schemas/; \
		cd ../temp_zip && zip -r ../final_$(UUID).shell-extension.zip .; \
		cd .. && rm -rf temp_zip; \
		rm $(UUID).shell-extension.zip; \
		mv final_$(UUID).shell-extension.zip $(UUID).shell-extension.zip; \
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
		rm -f po/LINGUAS; \
		for l in $$(ls po/*.po); do basename $$l .po >> po/LINGUAS; done; \
		mkdir -p po/mo; \
		cp po/LINGUAS po/mo/LINGUAS; \
		cd po && \
		for lang in $$(cat LINGUAS); do \
			mv $${lang}.po $${lang}.po.old; \
			msginit --no-translator --locale=$$lang --input $(UUID).pot -o $${lang}.po.new > /dev/null; \
			msgmerge -N $${lang}.po.old $${lang}.po.new > $${lang}.po; \
			rm $${lang}.po.old $${lang}.po.new; \
			msgfmt -o mo/$${lang}.mo $${lang}.po; \
		done; \
		echo "+ POT file generation done"; \
	else \
		echo "Warning: po directory does not exist. Skipping translation updates."; \
	fi
