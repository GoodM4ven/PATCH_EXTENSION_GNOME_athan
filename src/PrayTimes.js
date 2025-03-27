
// ? Dummy function nessesary for translation with xgettext tool.
function _(str) {
    return str;
}

export function getMethods() {
    return {
        MWL: {
            name: _('Muslim World League'),
            params: { fajr: 18, isha: 17 },
        },
        Makkah: {
            name: _('Umm Al-Qura University, Makkah'),
            params: { fajr: 18.5, isha: '90 min' },
        },
        Egypt: {
            name: _('Egyptian General Authority of Survey'),
            params: { fajr: 19.5, isha: 17.5 },
        },
        Karachi: {
            name: _('University of Islamic Sciences, Karachi'),
            params: { fajr: 18, isha: 18 },
        },
    };
}

export function PrayTimes(method) {
    var timeNames = {
            imsak: _('Imsak'),
            fajr: _('Fajr'),
            sunrise: _('Sunrise'),
            dhuhr: _('Dhuhr'),
            asr: _('Asr'),
            sunset: _('Sunset'),
            maghrib: _('Maghrib'),
            isha: _('Isha'),
            midnight: _('Midnight'),
        },
        methods = getMethods(),
        defaultParams = {
            maghrib: '0 min',
            midnight: 'Standard',
        },
        calcMethod = 'MWL',
        setting = {
            imsak: '10 min',
            dhuhr: '0 min',
            asr: 'Standard',
            highLats: 'NightMiddle',
        },
        timeFormat = '24h',
        timeSuffixes = ['AM', 'PM'],
        invalidTime = '-----',
        numIterations = 1,
        offset = {},
        lat,
        lng,
        elv,
        timeZone,
        jDate;

    let defParams = defaultParams;
    for (let i in methods) {
        let params = methods[i].params;
        for (let j in defParams)
            if (typeof params[j] == 'undefined') params[j] = defParams[j];
    }

    calcMethod = methods[method] ? method : calcMethod;
    let params = methods[calcMethod].params;
    for (let id in params) setting[id] = params[id];

    // ? The keys for the offset object are the same as the string values of the timeNames object
    for (let i in timeNames) offset[i] = 0;

    return {
        setMethod: function (method) {
            if (methods[method]) {
                this.adjust(methods[method].params);
                calcMethod = method;
            }
        },

        adjust: function (params) {
            for (let id in params) setting[id] = params[id];
        },

        tune: function (timeOffsets) {
            for (let i in timeOffsets) offset[i] = timeOffsets[i];
        },

        getMethod: function () {
            return calcMethod;
        },

        getSetting: function () {
            return setting;
        },

        getOffsets: function () {
            return offset;
        },

        getDefaults: function () {
            return methods;
        },

        getTimes: function (date, coords, timezone, dst, format) {
            lat = 1 * coords[0];
            lng = 1 * coords[1];
            elv = coords[2] ? 1 * coords[2] : 0;
            timeFormat = format || timeFormat;
            if (date.constructor === Date)
                date = [
                    date.getFullYear(),
                    date.getMonth() + 1,
                    date.getDate(),
                ];
            if (typeof timezone == 'undefined' || timezone == 'auto')
                timezone = this.getTimeZone(date);
            if (typeof dst == 'undefined' || dst == 'auto')
                dst = this.getDst(date);
            timeZone = 1 * timezone + (1 * dst ? 1 : 0);
            jDate = this.julian(date[0], date[1], date[2]) - lng / (15 * 24);

            return this.computeTimes();
        },

        getFormattedTime: function (time, format, suffixes) {
            if (isNaN(time)) return invalidTime;
            suffixes = suffixes || timeSuffixes;

            time = DMath.fixHour(time);
            let hours = Math.floor(time);
            let minutes = Math.floor((time - hours) * 60);
            let suffix = format == '12h' ? suffixes[hours < 12 ? 0 : 1] : '';
            let hour =
                format == '24h'
                    ? this.twoDigitsFormat(hours)
                    : ((hours + 12 - 1) % 12) + 1;

            if (format == 'Float') return hours + minutes / 60;

            return (
                hour +
                ':' +
                this.twoDigitsFormat(minutes) +
                (suffix ? ' ' + suffix : '')
            );
        },

        midDay: function (time) {
            let eqt = this.sunPosition(jDate + time).equation;
            let noon = DMath.fixHour(12 - eqt);
            return noon;
        },

        sunAngleTime: function (angle, time, direction) {
            let decl = this.sunPosition(jDate + time).declination;
            let noon = this.midDay(time);
            let t =
                (1 / 15) *
                DMath.arccos(
                    (-DMath.sin(angle) - DMath.sin(decl) * DMath.sin(lat)) /
                        (DMath.cos(decl) * DMath.cos(lat))
                );
            return noon + (direction == 'ccw' ? -t : t);
        },

        asrTime: function (factor, time) {
            let decl = this.sunPosition(jDate + time).declination;
            let angle = -DMath.arccot(factor + DMath.tan(Math.abs(lat - decl)));
            return this.sunAngleTime(angle, time);
        },

        sunPosition: function (jd) {
            let D = jd - 2451545.0;
            let g = DMath.fixAngle(357.529 + 0.98560028 * D);
            let q = DMath.fixAngle(280.459 + 0.98564736 * D);
            let L = DMath.fixAngle(
                q + 1.915 * DMath.sin(g) + 0.02 * DMath.sin(2 * g)
            );

            // let R = 1.00014 - 0.01671 * DMath.cos(g) - 0.00014 * DMath.cos(2 * g);
            let e = 23.439 - 0.00000036 * D;

            let RA =
                DMath.arctan2(DMath.cos(e) * DMath.sin(L), DMath.cos(L)) / 15;
            let eqt = q / 15 - DMath.fixHour(RA);
            let decl = DMath.arcsin(DMath.sin(e) * DMath.sin(L));

            return { declination: decl, equation: eqt };
        },

        julian: function (year, month, day) {
            if (month <= 2) {
                year -= 1;
                month += 12;
            }
            let A = Math.floor(year / 100);
            let B = 2 - A + Math.floor(A / 4);

            let JD =
                Math.floor(365.25 * (year + 4716)) +
                Math.floor(30.6001 * (month + 1)) +
                day +
                B -
                1524.5;
            return JD;
        },

        computePrayerTimes: function (times) {
            times = this.dayPortion(times);
            let params = setting;

            let imsak = this.sunAngleTime(
                this.eval(params.imsak),
                times.imsak,
                'ccw'
            );
            let fajr = this.sunAngleTime(
                this.eval(params.fajr),
                times.fajr,
                'ccw'
            );
            let sunrise = this.sunAngleTime(
                this.riseSetAngle(),
                times.sunrise,
                'ccw'
            );
            let dhuhr = this.midDay(times.dhuhr);
            let asr = this.asrTime(this.asrFactor(params.asr), times.asr);
            let sunset = this.sunAngleTime(this.riseSetAngle(), times.sunset);
            let maghrib = this.sunAngleTime(
                this.eval(params.maghrib),
                times.maghrib
            );
            let isha = this.sunAngleTime(this.eval(params.isha), times.isha);

            return {
                imsak: imsak,
                fajr: fajr,
                sunrise: sunrise,
                dhuhr: dhuhr,
                asr: asr,
                sunset: sunset,
                maghrib: maghrib,
                isha: isha,
            };
        },

        computeTimes: function () {
            let times = {
                imsak: 5,
                fajr: 5,
                sunrise: 6,
                dhuhr: 12,
                asr: 13,
                sunset: 18,
                maghrib: 18,
                isha: 18,
            };

            for (let i = 1; i <= numIterations; i++)
                times = this.computePrayerTimes(times);

            times = this.adjustTimes(times);

            times.midnight =
                setting.midnight == 'Jafari'
                    ? times.sunset + this.timeDiff(times.sunset, times.fajr) / 2
                    : times.sunset +
                      this.timeDiff(times.sunset, times.sunrise) / 2;

            times = this.tuneTimes(times);
            return this.modifyFormats(times);
        },

        adjustTimes: function (times) {
            let params = setting;
            for (let i in times) times[i] += timeZone - lng / 15;

            if (params.highLats != 'None') times = this.adjustHighLats(times);

            if (this.isMin(params.imsak))
                times.imsak = times.fajr - this.eval(params.imsak) / 60;
            if (this.isMin(params.maghrib))
                times.maghrib = times.sunset + this.eval(params.maghrib) / 60;
            if (this.isMin(params.isha))
                times.isha = times.maghrib + this.eval(params.isha) / 60;
            times.dhuhr += this.eval(params.dhuhr) / 60;

            return times;
        },

        asrFactor: function (asrParam) {
            let factor = { Standard: 1, Hanafi: 2 }[asrParam];
            return factor || this.eval(asrParam);
        },

        riseSetAngle: function () {
            let angle = 0.0347 * Math.sqrt(elv);
            return 0.833 + angle;
        },

        tuneTimes: function (times) {
            for (let i in times) times[i] += offset[i] / 60;
            return times;
        },

        modifyFormats: function (times) {
            for (let i in times)
                times[i] = this.getFormattedTime(times[i], timeFormat);
            return times;
        },

        adjustHighLats: function (times) {
            let params = setting;
            let nightTime = this.timeDiff(times.sunset, times.sunrise);

            times.imsak = this.adjustHLTime(
                times.imsak,
                times.sunrise,
                this.eval(params.imsak),
                nightTime,
                'ccw'
            );
            times.fajr = this.adjustHLTime(
                times.fajr,
                times.sunrise,
                this.eval(params.fajr),
                nightTime,
                'ccw'
            );
            times.isha = this.adjustHLTime(
                times.isha,
                times.sunset,
                this.eval(params.isha),
                nightTime
            );
            times.maghrib = this.adjustHLTime(
                times.maghrib,
                times.sunset,
                this.eval(params.maghrib),
                nightTime
            );

            return times;
        },

        adjustHLTime: function (time, base, angle, night, direction) {
            let portion = this.nightPortion(angle, night);
            let timeDiff =
                direction == 'ccw'
                    ? this.timeDiff(time, base)
                    : this.timeDiff(base, time);
            if (isNaN(time) || timeDiff > portion)
                time = base + (direction == 'ccw' ? -portion : portion);
            return time;
        },

        nightPortion: function (angle, night) {
            let method = setting.highLats;
            let portion = 1 / 2;
            if (method == 'AngleBased') portion = (1 / 60) * angle;
            if (method == 'OneSeventh') portion = 1 / 7;
            return portion * night;
        },

        dayPortion: function (times) {
            for (let i in times) times[i] /= 24;
            return times;
        },

        getTimeZone: function (date) {
            let year = date[0];
            let t1 = this.gmtOffset([year, 0, 1]);
            let t2 = this.gmtOffset([year, 6, 1]);
            return Math.min(t1, t2);
        },

        getDst: function (date) {
            return 1 * (this.gmtOffset(date) != this.getTimeZone(date));
        },

        gmtOffset: function (date) {
            let localDate = new Date(
                date[0],
                date[1] - 1,
                date[2],
                12,
                0,
                0,
                0
            );
            let GMTString = localDate.toGMTString();
            let GMTDate = new Date(
                GMTString.substring(0, GMTString.lastIndexOf(' ') - 1)
            );
            let hoursDiff = (localDate - GMTDate) / (1000 * 60 * 60);
            return hoursDiff;
        },

        eval: function (str) {
            return 1 * (str + '').split(/[^0-9.+-]/)[0];
        },

        isMin: function (arg) {
            return (arg + '').indexOf('min') != -1;
        },

        timeDiff: function (time1, time2) {
            return DMath.fixHour(time2 - time1);
        },

        twoDigitsFormat: function (num) {
            return num < 10 ? '0' + num : num;
        },
    };
}

let DMath = {
    dtr: function (d) {
        return (d * Math.PI) / 180.0;
    },
    rtd: function (r) {
        return (r * 180.0) / Math.PI;
    },

    sin: function (d) {
        return Math.sin(this.dtr(d));
    },
    cos: function (d) {
        return Math.cos(this.dtr(d));
    },
    tan: function (d) {
        return Math.tan(this.dtr(d));
    },

    arcsin: function (d) {
        return this.rtd(Math.asin(d));
    },
    arccos: function (d) {
        return this.rtd(Math.acos(d));
    },
    arctan: function (d) {
        return this.rtd(Math.atan(d));
    },

    arccot: function (x) {
        return this.rtd(Math.atan(1 / x));
    },
    arctan2: function (y, x) {
        return this.rtd(Math.atan2(y, x));
    },

    fixAngle: function (a) {
        return this.fix(a, 360);
    },
    fixHour: function (a) {
        return this.fix(a, 24);
    },

    fix: function (a, b) {
        a = a - b * Math.floor(a / b);
        return a < 0 ? a + b : a;
    },
};
