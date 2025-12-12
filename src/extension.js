import Geoclue from 'gi://Geoclue';
import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PermissionStore from 'resource:///org/gnome/shell/misc/permissionStore.js';
import * as PrayTimes from './PrayTimes.js';
import * as HijriCalendarKuwaiti from './HijriCalendarKuwaiti.js';

const POSITION = ['center', 'left', 'right'];

const Azan = GObject.registerClass(
    class Azan extends PanelMenu.Button {
        _init(extension) {
            super._init(0.5, _('Azan'));

            this.indicatorText = new St.Label({ text: _('Loading...'), y_align: Clutter.ActorAlign.CENTER });
            this.add_child(this.indicatorText);

            this._gclueLocationChangedId = 0;
            this._weatherAuthorized = false;

            this._opt_calculationMethod = null;
            this._opt_madhab = null;
            this._opt_latitude = null;
            this._opt_longitude = null;
            this._opt_timezone = null;
            this._opt_timeformat12 = false;
            this._opt_concise_list = null;
            this._opt_hijriDateAdjustment = null;
            this._opt_iqamah = null;
            this._opt_iqamah_fajr = null;
            this._opt_iqamah_dhuhr = null;
            this._opt_iqamah_asr = null;
            this._opt_iqamah_maghrib = null;
            this._opt_iqamah_isha = null;
            this._opt_notification_for_azan = null;
            this._opt_notification_before_azan = null;
            this._opt_notification_before_iqamah = null;
            this._currIqamahOffset = 0;

            this._settings = extension.getSettings('org.gnome.shell.extensions.athan');
            this._bindSettings();
            this._loadSettings();

            var position = POSITION[this._opt_panel_position];
            Main.panel.addToStatusArea('athan@goodm4ven', this, 1, position);

            this._dateFormatFull = _('%A %B %e, %Y');

            this._prayTimes = new PrayTimes.PrayTimes('MWL');

            this._dayNames = new Array('Ahad', 'Ithnin', 'Thulatha', 'Arbiaa', 'Khamees', 'Jomuah', 'Issabt');
            this._monthNames = new Array(
                'Muharram',
                'Safar',
                "Rabi'ul Awwal",
                "Rabi'ul Akhir",
                'Jumadal Ula',
                'Jumadal Akhira',
                'Rajab',
                "Sha'ban",
                'Ramadhan',
                'Shawwal',
                "Dhul Qa'ada",
                'Dhul Hijja'
            );

            // If today is Friday, show Jummah instead of Dhuhr
            let today = new Date();
            let dayOfWeek = today.getDay();
            this._timeNames = {
                fajr: 'Fajr',
                // sunrise: 'Sunrise',
                dhuhr: dayOfWeek === 5 ? 'Jummah' : 'Dhuhr',
                asr: 'Asr',
                // sunset: 'Sunset',
                maghrib: 'Maghrib',
                isha: 'Isha',
                // midnight: 'Midnight',
            };

            this._iqamahOffsets = {
                fajr: this._opt_iqamah_fajr,
                dhuhr: this._opt_iqamah_dhuhr,
                asr: this._opt_iqamah_asr,
                maghrib: this._opt_iqamah_maghrib,
                isha: this._opt_iqamah_isha,
            };

            this._timeConciseLevels = {
                fajr: 1,
                // sunrise: 0,
                dhuhr: 1,
                asr: 1,
                // sunset: 0,
                maghrib: 1,
                isha: 1,
                // midnight: 0,
            };

            this._calcMethodsArr = ['MUI', 'MWL', 'ISNA', 'Egypt', 'Makkah', 'Karachi', 'Tehran'];
            this._madhabArr = ['Standard', 'Hanafi'];
            this._timezoneArr = Array.from({ length: 27 }, (_, index) => (index - 12).toString());
            this._timezoneArr.unshift('auto');

            this._prayItems = {};

            this._dateMenuItem = new PopupMenu.PopupMenuItem(_('TODO'), {
                style_class: 'athan-panel',
                reactive: false,
                hover: false,
                activate: false,
            });

            this.menu.addMenuItem(this._dateMenuItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            for (let prayerId in this._timeNames) {
                let prayerName = this._timeNames[prayerId];

                let prayMenuItem = new PopupMenu.PopupMenuItem(_(prayerName), {
                    reactive: false,
                    hover: false,
                    activate: false,
                });

                let bin = new St.Bin({ x_expand: true, x_align: Clutter.ActorAlign.END });

                let prayLabel = new St.Label({ style_class: 'athan-label' });
                bin.add_child(prayLabel);

                prayMenuItem.actor.add_child(bin);

                this.menu.addMenuItem(prayMenuItem);

                this._prayItems[prayerId] = { menuItem: prayMenuItem, label: prayLabel };
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Modernize menu preferences
            this.prefs_s = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
            let l = new St.Label({ text: ' ' });
            l.x_expand = true;
            this.prefs_s.actor.add_child(l);
            this.prefs_b = new St.Button({
                child: new St.Icon({ icon_name: 'preferences-system-symbolic', icon_size: 30 }),
                style_class: 'prefs_s_action',
            });

            this.prefs_b.connect('clicked', () => {
                extension.openPreferences();
            });

            this.prefs_s.actor.add_child(this.prefs_b);
            l = new St.Label({ text: ' ' });
            l.x_expand = true;
            this.prefs_s.actor.add_child(l);

            this.menu.addMenuItem(this.prefs_s);

            this._updateLabelPeriodic();
            this._updatePrayerVisibility();

            this._permStore = new PermissionStore.PermissionStore((proxy, error) => {
                if (error) {
                    log('Failed to connect to permissionStore: ' + error.message);
                    return;
                }

                this._permStore.LookupRemote('gnome', 'geolocation', (res, error) => {
                    if (error) log('Error looking up permission: ' + error.message);

                    let [perms, data] = error ? [{}, null] : res;
                    let params = ['gnome', 'geolocation', false, data, perms];
                    this._onPermStoreChanged(this._permStore, '', params);
                });
            });
        }

        _startGClueService() {
            if (this._gclueStarting) return;

            this._gclueStarting = true;

            Geoclue.Simple.new('org.gnome.Shell', Geoclue.AccuracyLevel.EXACT, null, (o, res) => {
                try {
                    this._gclueService = Geoclue.Simple.new_finish(res);
                } catch (e) {
                    log('Failed to connect to Geoclue2 service: ' + e.message);
                    return;
                }
                this._gclueStarted = true;
                this._gclueService.get_client().distance_threshold = 100;
                this._updateLocationMonitoring();
            });
        }

        _onPermStoreChanged(proxy, sender, params) {
            let [table, id, deleted, data, perms] = params;

            if (table != 'gnome' || id != 'geolocation') return;

            let permission = perms['org.gnome.Weather.Application'] || ['NONE'];
            let [accuracy] = permission;
            this._weatherAuthorized = accuracy != 'NONE';

            this._updateAutoLocation();
        }

        _onGClueLocationChanged() {
            let geoLocation = this._gclueService.location;
            this._opt_latitude = geoLocation.latitude;
            this._opt_longitude = geoLocation.longitude;
            this._settings.set_double('latitude', this._opt_latitude);
            this._settings.set_double('longitude', this._opt_longitude);
        }

        _updateLocationMonitoring() {
            if (this._opt_autoLocation) {
                if (this._gclueLocationChangedId != 0 || this._gclueService == null) return;

                this._gclueLocationChangedId = this._gclueService.connect(
                    'notify::location',
                    this._onGClueLocationChanged.bind(this)
                );
                this._onGClueLocationChanged();
            } else {
                if (this._gclueLocationChangedId) this._gclueService.disconnect(this._gclueLocationChangedId);
                this._gclueLocationChangedId = 0;
            }
        }

        _updateAutoLocation() {
            this._updateLocationMonitoring();

            if (this._opt_autoLocation) {
                this._startGClueService();
            }
        }

        _loadSettings() {
            this._opt_calculationMethod = this._settings.get_int('calculation-method');
            this._opt_madhab = this._settings.get_int('madhab');
            this._opt_autoLocation = this._settings.get_boolean('auto-location');
            this._updateAutoLocation();
            this._opt_latitude = this._settings.get_double('latitude');
            this._opt_longitude = this._settings.get_double('longitude');
            this._opt_panel_position = this._settings.get_int('panel-position');
            this._opt_timeformat12 = this._settings.get_boolean('time-format-12');
            this._opt_timezone = this._settings.get_int('timezone');
            this._opt_concise_list = this._settings.get_int('concise-list');
            this._opt_hijriDateAdjustment = this._settings.get_int('hijri-date-adjustment');
            this._opt_iqamah = this._settings.get_boolean('iqamah');
            this._opt_iqamah_fajr = this._settings.get_int('iqamah-fajr');
            this._opt_iqamah_dhuhr = this._settings.get_int('iqamah-dhuhr');
            this._opt_iqamah_asr = this._settings.get_int('iqamah-asr');
            this._opt_iqamah_maghrib = this._settings.get_int('iqamah-maghrib');
            this._opt_iqamah_isha = this._settings.get_int('iqamah-isha');
            this._opt_notification_for_azan = this._settings.get_boolean('notify-for-azan');
            this._opt_notification_before_azan = this._settings.get_int('notify-before-azan');
            this._opt_notification_before_iqamah = this._settings.get_int('notify-before-iqamah');
        }

        _bindSettings() {
            this._settings.connect('changed::' + 'auto-location', (settings, key) => {
                this._opt_autoLocation = settings.get_boolean(key);
                this._updateAutoLocation();
                this._updateLabel();
            });

            this._settings.connect('changed::' + 'calculation-method', (settings, key) => {
                this._opt_calculationMethod = settings.get_int(key);

                this._updateLabel();
            });

            this._settings.connect('changed::' + 'madhab', (settings, key) => {
                this._opt_madhab = settings.get_int(key);

                this._updateLabel();
            });

            this._settings.connect('changed::' + 'latitude', (settings, key) => {
                this._opt_latitude = settings.get_double(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'longitude', (settings, key) => {
                this._opt_longitude = settings.get_double(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'panel-position', (settings, key) => {
                this._opt_panel_position = settings.get_int(key);
                this._updateLabel();
            });
            this._settings.connect('changed::' + 'time-format-12', (settings, key) => {
                this._opt_timeformat12 = settings.get_boolean(key);
                this._updateLabel();
            });
            this._settings.connect('changed::' + 'timezone', (settings, key) => {
                this._opt_timezone = settings.get_int(key);

                this._updateLabel();
            });

            this._settings.connect('changed::' + 'concise-list', (settings, key) => {
                this._opt_concise_list = settings.get_int(key);
                this._updateLabel();
                this._updatePrayerVisibility();
            });

            this._settings.connect('changed::' + 'hijri-date-adjustment', (settings, key) => {
                this._opt_hijriDateAdjustment = settings.get_int(key);

                this._updateLabel();
            });

            this._settings.connect('changed::' + 'iqamah', (settings, key) => {
                this._opt_iqamah = settings.get_boolean(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'iqamah-fajr', (settings, key) => {
                this._opt_iqamah_fajr = settings.get_int(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'iqamah-dhuhr', (settings, key) => {
                this._opt_iqamah_dhuhr = settings.get_int(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'iqamah-asr', (settings, key) => {
                this._opt_iqamah_asr = settings.get_int(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'iqamah-maghrib', (settings, key) => {
                this._opt_iqamah_maghrib = settings.get_int(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'iqamah-isha', (settings, key) => {
                this._opt_iqamah_isha = settings.get_int(key);

                this._updateLabel();
            });
            this._settings.connect('changed::' + 'notify-for-azan', (settings, key) => {
                this._opt_notification_for_azan = settings.get_boolean(key);
                this._updateLabel();
            });
            this._settings.connect('changed::' + 'notify-before-azan', (settings, key) => {
                this._opt_notification_before_azan = settings.get_int(key);
                this._updateLabel();
            });
            this._settings.connect('changed::' + 'notify-before-iqamah', (settings, key) => {
                this._opt_notification_before_iqamah = settings.get_int(key);
                this._updateLabel();
            });
        }

        _updatePrayerVisibility() {
            for (let prayerId in this._timeNames) {
                this._prayItems[prayerId].menuItem.actor.visible = this._isVisiblePrayer(prayerId);
            }
        }

        _isVisiblePrayer(prayerId) {
            return this._timeConciseLevels[prayerId] >= this._opt_concise_list;
        }

        _updateLabelPeriodic() {
            // Remove the previous timeout if it exists
            if (this._periodicTimeoutId) {
                GLib.source_remove(this._periodicTimeoutId);
            }

            // Schedule the next update at the start of the next minute
            const currentSeconds = new Date().getSeconds();
            const delaySeconds = 60 - currentSeconds;

            this._periodicTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delaySeconds, () => {
                this._updateLabel();
                this._updateLabelPeriodic(); // Schedule the next update
                return GLib.SOURCE_CONTINUE;
            });
        }

        _updateLabel() {
            const currentDate = new Date();
            const currentSeconds = this._calculateSecondsFromDate(currentDate);

            const timesStr = this._getPrayerTimes(currentDate, 'String');
            const timesFloat = this._getPrayerTimes(currentDate, 'Float');

            // Update prayer time labels
            for (const prayerId in this._timeNames) {
                this._prayItems[prayerId].label.text = timesStr[prayerId];
            }

            const { nearestPrayerId, minDiffMinutes, isTimeForPraying, isAfterAzan } = this._findNearestPrayer(
                timesFloat,
                currentSeconds
            );

            this._updateIslamicDate();
            this._handlePrayerNotifications(isAfterAzan, minDiffMinutes, nearestPrayerId, timesStr);
            this._updateIndicatorText(isTimeForPraying, isAfterAzan, minDiffMinutes, nearestPrayerId, timesStr);
        }

        _getPrayerTimes(currentDate, format) {
            const myLocation = [this._opt_latitude, this._opt_longitude];
            const myTimezone = this._timezoneArr[this._opt_timezone];

            this._prayTimes.setMethod(this._calcMethodsArr[this._opt_calculationMethod]);
            this._prayTimes.adjust({ asr: this._madhabArr[this._opt_madhab] });

            return this._opt_timeformat12
                ? this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', format === 'String' ? '12h' : 'Float')
                : this._prayTimes.getTimes(currentDate, myLocation, myTimezone, 'auto', format === 'String' ? '24h' : 'Float');
        }

        _findNearestPrayer(timesFloat, currentSeconds) {
            let nearestPrayerId = null;
            let minDiffMinutes = Number.MAX_VALUE;
            let isTimeForPraying = false;
            let isAfterAzan = false;

            for (const prayerId in this._timeNames) {
                const prayerSeconds = this._calculatePrayerSeconds(timesFloat, prayerId, currentSeconds);
                const diffSeconds = prayerSeconds - currentSeconds;

                const isInIqamahOffsetRange = this._isInIqamahOffsetRange(diffSeconds);
                if (this._opt_iqamah && isInIqamahOffsetRange) {
                    this._handleIqamah(diffSeconds, prayerId);
                }

                if (diffSeconds <= 0 && diffSeconds > -60) {
                    isTimeForPraying = true;
                    nearestPrayerId = prayerId;
                    this._setCurrIqamahOffset(nearestPrayerId);
                    break;
                }

                if (diffSeconds > 0) {
                    const diffMinutes = Math.floor(diffSeconds / 60);
                    if (diffMinutes <= minDiffMinutes) {
                        minDiffMinutes = diffMinutes;
                        nearestPrayerId = prayerId;
                    }
                }
            }

            return { nearestPrayerId, minDiffMinutes, isTimeForPraying, isAfterAzan };
        }

        _calculatePrayerSeconds(timesFloat, prayerId, currentSeconds) {
            let prayerSeconds = this._calculateSecondsFromHour(timesFloat[prayerId]);
            const ishaSeconds = this._calculateSecondsFromHour(timesFloat['isha']);
            const fajrSeconds = this._calculateSecondsFromHour(timesFloat['fajr']);

            if (prayerId === 'fajr' && currentSeconds > ishaSeconds) {
                prayerSeconds = fajrSeconds + 24 * 60 * 60;
            }

            return prayerSeconds;
        }

        _isInIqamahOffsetRange(diffSeconds) {
            return diffSeconds <= 0 && diffSeconds >= -60 * 35;
        }

        _handleIqamah(diffSeconds, prayerId) {
            let nearestPrayerId = prayerId;
            this._setCurrIqamahOffset(nearestPrayerId);
            if (diffSeconds >= -60 * this._currIqamahOffset) {
                const diffMinutes = Math.floor(diffSeconds / 60);
                if (diffMinutes <= this.minDiffMinutes) {
                    this.minDiffMinutes = diffMinutes;
                }
                return true;
            }
            return false;
        }

        _updateIslamicDate() {
            const hijriDate = HijriCalendarKuwaiti.KuwaitiCalendar(this._opt_hijriDateAdjustment);
            const outputIslamicDate = this._formatHijriDate(hijriDate);
            this._dateMenuItem.label.text = outputIslamicDate;
        }

        _handlePrayerNotifications(isAfterAzan, minDiffMinutes, nearestPrayerId, timesStr) {
            if (this._opt_notification_before_azan && this._opt_notification_before_azan * 5 == minDiffMinutes) {
                Main.notify(
                    _(minDiffMinutes + ' minutes remaining until ' + this._timeNames[nearestPrayerId]) + ' prayer.',
                    _('Prayer time : ' + timesStr[nearestPrayerId])
                );
            }

            if (
                isAfterAzan &&
                this._opt_notification_before_iqamah &&
                this._opt_iqamah &&
                this._currIqamahOffset - this._opt_notification_before_iqamah * 5 == -1 * minDiffMinutes
            ) {
                Main.notify(
                    _(this._opt_notification_before_iqamah * 5 + ' minutes remaining until ' + this._timeNames[nearestPrayerId]) +
                        ' iqamah.'
                );
            }
        }

        _updateIndicatorText(isTimeForPraying, isAfterAzan, minDiffMinutes, nearestPrayerId, timesStr) {
            if (isTimeForPraying) {
                if (this._opt_notification_for_azan) {
                    Main.notify(
                        _("It's time for the " + this._timeNames[nearestPrayerId]) + ' prayer.',
                        _('Prayer time : ' + timesStr[nearestPrayerId])
                    );
                }
                this.indicatorText.set_text(_("It's time for " + this._timeNames[nearestPrayerId]));
            } else if (isAfterAzan && this._opt_iqamah) {
                this.indicatorText.set_text(
                    this._timeNames[nearestPrayerId] + ' +' + this._formatRemainingTimeFromMinutes(-1 * minDiffMinutes)
                );
            } else {
                this.indicatorText.set_text(
                    this._timeNames[nearestPrayerId] + ' -' + this._formatRemainingTimeFromMinutes(minDiffMinutes)
                );
            }
        }

        _getNextPrayer(prayerId) {
            const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
            const currentIndex = prayers.indexOf(prayerId);
            const nextIndex = (currentIndex + 1) % prayers.length;
            return prayers[nextIndex];
        }

        _setCurrIqamahOffset(nearestPrayerId) {
            this._currIqamahOffset = this._iqamahOffsets[nearestPrayerId];
        }

        _calculateSecondsFromDate(date) {
            return this._calculateSecondsFromHour(date.getHours()) + date.getMinutes() * 60;
        }

        _calculateSecondsFromHour(hour) {
            return hour * 60 * 60;
        }

        _isPrayerTime(prayerId) {
            return (
                prayerId === 'fajr' || prayerId === 'dhuhr' || prayerId === 'asr' || prayerId === 'maghrib' || prayerId === 'isha'
            );
        }

        _formatRemainingTimeFromMinutes(diffMinutes) {
            let hours = ~~(diffMinutes / 60);
            let minutes = ~~(diffMinutes % 60);

            let hoursStr = (hours < 10 ? '0' : '') + hours;
            let minutesStr = (minutes < 10 ? '0' : '') + minutes;

            return hoursStr + ':' + minutesStr;
        }

        _formatHijriDate(hijriDate) {
            return this._dayNames[hijriDate[4]] + ', ' + hijriDate[5] + ' ' + this._monthNames[hijriDate[6]] + ' ' + hijriDate[7];
        }

        stop() {
            this.menu.removeAll();

            if (this._periodicTimeoutId) {
                GLib.source_remove(this._periodicTimeoutId);
            }
        }
    }
);

let azan;

export default class AzanExtension extends Extension {
    constructor(metadata) {
        super(metadata);
    }

    enable() {
        azan = new Azan(this);
    }

    disable() {
        azan.stop();
        azan.destroy();
        azan = null;
    }
}
