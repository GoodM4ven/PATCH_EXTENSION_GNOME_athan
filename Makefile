#=============================================================================
NAME=athan
UUID=$(NAME)@goodm4ven
BUILDDIR=build
INSTALL_PATH=~/.local/share/gnome-shell/extensions
#=============================================================================
default_target: all
.PHONY: clean all zip install reloadGnome check compile-schemas lint pot uninstall 

clean:
	@rm -rf $(BUILDDIR) po/mo
	@echo "+ Clean done"

check:
	@echo "Checking prerequisites..."
	@command -v glib-compile-schemas >/dev/null 2>&1 || { echo >&2 "glib-compile-schemas is not installed. Aborting."; exit 1; }
	@command -v eslint >/dev/null 2>&1 || { echo >&2 "ESLint is not installed. Aborting."; exit 1; }

# ? compile the schemas
compile-schemas:
	@if [ -d $(BUILDDIR)/$(UUID)/schemas ]; then \
		glib-compile-schemas $(BUILDDIR)/$(UUID)/schemas; \
	fi

# ? Linting the code
lint: check
	eslint src/**/*.js

# ? Build the extension
all: clean compile-schemas pot
	@mkdir -p $(BUILDDIR)/$(UUID)
	@cp -rt $(BUILDDIR)/$(UUID) \
	src po schemas .github/images
	@if [ -d $(BUILDDIR)/$(UUID)/schemas ]; then \
		glib-compile-schemas $(BUILDDIR)/$(UUID)/schemas; \
	fi
	@cd $(BUILDDIR)/$(UUID) && \
	for lang in $$(cat po/mo/LINGUAS); do \
		mkdir -p locale/$$lang/LC_MESSAGES; \
		cp po/mo/$$lang.mo locale/$$lang/LC_MESSAGES/$(UUID).mo; \
	done
	@rm -rf $(BUILDDIR)/$(UUID)/po
	@echo "+ Build done"

zip: all
	@cd $(BUILDDIR)/$(UUID)/src && \
	gnome-extensions pack -f \
		--extra-source=../{images,schemas,locale} \
		--extra-source={PrayTimes,HijriCalendarKuwaiti}.js \
		--out-dir=../../
	@echo "+ Zip file creation done"

uninstall:
	rm -rf $(INSTALL_PATH)/$(UUID)
	@echo "+ Uninstallation done"

install: uninstall zip
	gnome-extensions install -f build/$(UUID).shell-extension.zip
	@echo "+ Installation done"

reloadGnome:
	@dbus-send --type=method_call --print-reply --dest=org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Eval string:'global.reexec_self()' || \
	{ echo "Failed to reload GNOME Shell. Please restart it manually."; exit 1; }

pot:
	@rm po/LINGUAS
	@for l in $$(ls po/*.po); do	basename $$l .po >> po/LINGUAS; done
	@mkdir -p po/mo
	@cp po/LINGUAS po/mo/LINGUAS
	@cd po && \
	for lang in $$(cat LINGUAS); do \
		mv $${lang}.po $${lang}.po.old; \
		msginit --no-translator --locale=$$lang --input $(UUID).pot -o $${lang}.po.new > /dev/null; \
		msgmerge -N $${lang}.po.old $${lang}.po.new > $${lang}.po; \
		rm $${lang}.po.old $${lang}.po.new; \
		msgfmt -o mo/$${lang}.mo $${lang}.po; \
	done
	@echo "+ POT file generatation done"
