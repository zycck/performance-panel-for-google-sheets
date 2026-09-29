// ==UserScript==
// @name         Performance Panel for Google Sheets
// @namespace    urn:sheets-scope:userscript
// @version      0.3.18
// @description  Нативная панель производительности Google Таблиц: пересчёт листа и медленные ячейки.
// @match        https://docs.google.com/spreadsheets/*
// @run-at       document-start
// @sandbox      raw
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==
(function() {
	//#region userscript/src/native-data.js
	var number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
	var phaseName = (type) => ({
		1: "Формулы",
		2: "Условное форматирование",
		3: "Проверка данных",
		4: "Таблицы"
	})[type] ?? `Тип ${type ?? "неизвестен"}`;
	function decodeNativeStats(stats) {
		if (stats == null) return {
			available: false,
			phases: [],
			observations: []
		};
		if (!Array.isArray(stats) || stats[9] != null && !Array.isArray(stats[9])) throw Error("Изменилась схема результатов Sheets.");
		const phases = [], observations = [];
		for (const [phaseIndex, phase] of (stats[9] ?? []).entries()) {
			if (!Array.isArray(phase) || phase[10] != null && !Array.isArray(phase[10])) throw Error("Неизвестная схема фазы расчёта.");
			const type = number(phase[0]);
			phases.push({
				phaseIndex,
				type,
				name: phaseName(type),
				elapsedMs: number(phase[1]),
				dirtyCount: number(phase[3]),
				evaluatedCount: number(phase[4])
			});
			if ((phase[10]?.length ?? 0) > 100) throw Error("Неожиданный размер списка ячеек.");
			for (const [index, item] of (phase[10] ?? []).entries()) {
				if (!Array.isArray(item)) throw Error("Неизвестная схема времени ячейки.");
				const coord = item[1];
				const row = number(coord?.[1]), col = number(coord?.[2]);
				observations.push({
					phaseIndex,
					index,
					type,
					latencyMs: number(item[0]),
					sheetId: typeof coord?.[0] === "string" ? coord[0] : null,
					row: Number.isInteger(row) ? row : null,
					col: Number.isInteger(col) ? col : null
				});
			}
		}
		return {
			available: true,
			phases,
			observations
		};
	}
	function cellAddress(row, col) {
		if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || col > 18277) return null;
		let label = "";
		for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
		return label + (row + 1);
	}
	function rankCells$1(observations, sheetId = "") {
		const cells = /* @__PURE__ */ new Map();
		for (const item of observations) {
			if (sheetId && item.sheetId !== sheetId) continue;
			const key = JSON.stringify([
				item.sheetId,
				item.row,
				item.col,
				item.type
			]);
			const previous = cells.get(key);
			if (previous) {
				previous.observationCount++;
				if (item.latencyMs != null && (previous.latencyMs == null || item.latencyMs > previous.latencyMs)) previous.latencyMs = item.latencyMs;
			} else cells.set(key, {
				...item,
				address: cellAddress(item.row, item.col),
				observationCount: 1
			});
		}
		return [...cells.values()].sort((a, b) => (b.latencyMs ?? -1) - (a.latencyMs ?? -1));
	}
	var meanings = {
		MAP: "применяет LAMBDA к элементам диапазонов",
		LAMBDA: "задаёт обработку элемента",
		ARRAYFORMULA: "вычисляет массив значений",
		SUMIFS: "суммирует строки по нескольким условиям",
		COUNTIFS: "считает строки по нескольким условиям",
		COUNTIF: "считает совпадения по условию",
		SUMIF: "суммирует значения по условию",
		XLOOKUP: "ищет совпадение и возвращает соответствующее значение",
		VLOOKUP: "ищет в первом столбце диапазона",
		INDEX: "берёт значение по позиции",
		MATCH: "находит позицию совпадения",
		IF: "выбирает результат по условию",
		IFERROR: "заменяет ошибку другим результатом",
		IFNA: "заменяет ошибку отсутствующего совпадения",
		IFS: "выбирает результат по первому выполненному условию",
		VSTACK: "соединяет массивы по вертикали",
		HSTACK: "соединяет массивы по горизонтали",
		MAX: "выбирает наибольшее значение",
		LET: "задаёт имена промежуточным значениям",
		FILTER: "отбирает строки по условиям",
		QUERY: "обрабатывает диапазон по тексту запроса",
		SUM: "складывает значения",
		SORT: "сортирует диапазон",
		UNIQUE: "оставляет уникальные значения",
		IMPORTRANGE: "читает диапазон другой книги",
		INDIRECT: "получает ссылку из текста",
		OFFSET: "строит ссылку со смещением",
		CHOOSEROWS: "выбирает строки массива",
		TEXTJOIN: "соединяет текстовые значения"
	};
	function describeFormula(formula) {
		if (typeof formula !== "string") return [];
		const unquoted = formula.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'/g, " ");
		return [...new Set([...unquoted.matchAll(/([\p{L}_][\p{L}\p{N}_.]*)\s*\(/gu)].map((m) => m[1].toUpperCase()))].map((name) => ({
			name,
			description: meanings[name] ?? "функция в формуле; смысл определяется её аргументами"
		}));
	}
	//#endregion
	//#region userscript/src/ui/presentation.js
	var calculationTypes = [
		{
			id: "formula",
			label: "Формулы",
			shortLabel: "Формулы",
			color: "#5086ec"
		},
		{
			id: "format",
			label: "Условное форматирование",
			shortLabel: "Формат",
			color: "#d95040"
		},
		{
			id: "validation",
			label: "Проверка данных",
			shortLabel: "Проверка",
			color: "#f2bd42"
		}
	];
	var calculationType = (id) => calculationTypes.find((type) => type.id === id) ?? {
		id,
		label: id === "native-4" ? "Таблицы" : "Неизвестный тип",
		color: "#7b8089"
	};
	var formatTime = (ms) => ms == null ? "—" : ms >= 1e3 ? `${(ms / 1e3).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} с` : `${Math.round(ms)} мс`;
	function rankCells(cells, { sheet, includeRelated = false, type = "all" }) {
		return cells.filter((cell) => (includeRelated || sheet === "all" || cell.sheet === sheet) && (type === "all" || cell.type === type)).sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1));
	}
	//#endregion
	//#region userscript/src/results.js
	var measured = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
	function nativeBreakdown(aggregate) {
		return [...calculationTypes.map((type, index) => ({
			...type,
			field: [
				"qa",
				"ma",
				"oa"
			][index]
		})), {
			id: "load",
			label: "Загрузка",
			color: "#58a55c",
			field: "va"
		}].map(({ field, ...phase }) => {
			const seconds = measured(aggregate?.[field]);
			return {
				...phase,
				ms: seconds === null ? null : seconds * 1e3
			};
		});
	}
	function presentCells(observations) {
		return rankCells$1(observations).map((cell) => ({
			...cell,
			sheet: cell.sheetId,
			ms: cell.latencyMs,
			type: {
				1: "formula",
				2: "format",
				3: "validation"
			}[cell.type] ?? `native-${cell.type}`,
			description: describeFormula(cell.formula).map((fn) => `${fn.name} — ${fn.description}`).join("\n")
		}));
	}
	function createSessionTop() {
		const cells = /* @__PURE__ */ new Map();
		return {
			add(observations) {
				for (const item of observations) {
					const key = JSON.stringify([
						item.sheetId,
						item.row,
						item.col,
						item.type
					]);
					const old = cells.get(key);
					if (old) {
						if (item.latencyMs != null && (old.latencyMs == null || item.latencyMs > old.latencyMs)) cells.set(key, item);
					} else cells.set(key, item);
				}
			},
			read() {
				return {
					observations: [...cells.values()],
					truncated: false
				};
			}
		};
	}
	function cellHash(cell) {
		if (!/^-?\d+$/.test(String(cell.sheet ?? "")) || !/^[A-Z]+[1-9]\d*$/.test(cell.address ?? "")) throw Error("Адрес ячейки недоступен.");
		return `#gid=${encodeURIComponent(cell.sheet)}&range=${encodeURIComponent(cell.address)}`;
	}
	function cellURL(cell, currentURL) {
		const hash = cellHash(cell), url = new URL(currentURL);
		if (url.origin !== "https://docs.google.com" || !/^\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]+\/edit\/?$/.test(url.pathname)) throw Error("Откройте Google-таблицу.");
		for (const key of [
			"gid",
			"range",
			"rangeid",
			"eoid",
			"embedrangeref",
			"fvid",
			"vpid",
			"coid"
		]) url.searchParams.delete(key);
		url.searchParams.set("gid", String(cell.sheet));
		url.searchParams.set("range", cell.address);
		const previousHash = new URLSearchParams(url.hash.slice(1));
		const targetHash = new URLSearchParams(hash.slice(1));
		if (previousHash.has("calc_mode")) targetHash.set("calc_mode", previousHash.get("calc_mode"));
		url.hash = targetHash.toString();
		return url.href;
	}
	function navigateToCell(cell, win = window) {
		const url = cellURL(cell, win.location.href);
		if (url !== win.location.href) win.history.pushState(win.history.state, "", url);
		win.dispatchEvent(new win.PopStateEvent("popstate", { state: win.history.state }));
	}
	//#endregion
	//#region userscript/src/experimental.js
	var experimentalPhaseName = (type) => ({
		1: "Формулы",
		2: "Условное форматирование",
		3: "Проверка данных",
		4: "Таблицы",
		5: "Объекты",
		6: "Служебные ячейки"
	})[type] ?? `Тип ${type ?? "неизвестен"}`;
	var count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
	var finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
	var metricGroups = [
		{
			id: "work",
			label: "Объём расчёта"
		},
		{
			id: "reads",
			label: "Чтение и изменения"
		},
		{
			id: "cache",
			label: "Кэш частей формул"
		},
		{
			id: "arrays",
			label: "Массивы и источники"
		},
		{
			id: "rules",
			label: "Условное форматирование"
		}
	];
	var metrics = [
		[
			"initialDirty",
			"Исходная область",
			"work",
			[3],
			"Число объектов, помеченных для пересчёта в начале фазы. Это не число операций внутри формулы."
		],
		[
			"dirty",
			"К пересчёту",
			"work",
			[4],
			"Объём работы, отмеченной движком в этой фазе. Не обязательно уникальные ячейки."
		],
		[
			"evaluated",
			"Вычислено",
			"work",
			[5],
			"Число вычислений объектов фазы, включая возможные повторы. Не инструкции CPU."
		],
		[
			"direct",
			"Прямые зависимости",
			"work",
			[8],
			"Число напрямую зависимых объектов, затронутых пересчётом. Не список связей между адресами."
		],
		[
			"indirect",
			"Косвенные зависимости",
			"work",
			[9],
			"Число косвенно зависимых объектов, затронутых пересчётом."
		],
		[
			"rounds",
			"Проходы",
			"work",
			[6, 19],
			"Количество раундов расчёта, зарегистрированных движком."
		],
		[
			"iterations",
			"Итеративные проходы",
			"work",
			[6, 20],
			"Количество раундов итеративного расчёта. Отсутствие поля не означает ноль."
		],
		[
			"reads",
			"Чтения ячеек",
			"reads",
			[6, 12],
			"Количество обращений к ячейкам. Повторные чтения учитываются; это не число уникальных адресов."
		],
		[
			"modelReads",
			"Чтения из модели",
			"reads",
			[6, 37],
			"Обращения к модели данных, отдельно учтённые движком. Не число сетевых запросов."
		],
		[
			"ranges",
			"Чтения диапазонов",
			"reads",
			[6, 44],
			"Количество обращений к диапазонам. Не количество ячеек внутри них."
		],
		[
			"attempts",
			"Попытки обновления",
			"reads",
			[6, 13],
			"Попытки записать вычисленное значение до проверки, изменилось ли оно."
		],
		[
			"effective",
			"Изменения значений",
			"reads",
			[6, 14],
			"Обновления, которые прошли проверку изменения значения в движке."
		],
		[
			"updated",
			"Обновления ячеек",
			"reads",
			[6, 11],
			"Отдельный счётчик обновлений ячеек. Его нельзя складывать с попытками и изменениями значений."
		],
		[
			"cacheDetected",
			"Обнаружено",
			"cache",
			[6, 48],
			"Случаи обнаружения кэширования подвыражений. Не количество попаданий в кэш."
		],
		[
			"cacheApplied",
			"Применено к ячейкам",
			"cache",
			[6, 49],
			"Случаи применения механизма кэширования частей формулы. Эти два числа не образуют hit rate."
		],
		[
			"arrayFormulas",
			"Массивные формулы",
			"arrays",
			[6, 6],
			"Количество вычисленных массивных формул."
		],
		[
			"arrayCells",
			"Ячейки результатов",
			"arrays",
			[6, 7],
			"Количество ячеек результатов массивных формул. Это размер результатов, не время каждого элемента."
		],
		[
			"pivots",
			"Сводные таблицы",
			"arrays",
			[6, 2],
			"Количество вычислений сводных таблиц, отмеченных движком."
		],
		[
			"pivotRows",
			"Строки сводных",
			"arrays",
			[6, 16],
			"Суммарный показатель строк сводных таблиц в статистике фазы."
		],
		[
			"pivotColumns",
			"Столбцы сводных",
			"arrays",
			[6, 17],
			"Суммарный показатель столбцов сводных таблиц в статистике фазы."
		],
		[
			"sources",
			"Источники данных",
			"arrays",
			[6, 4],
			"Количество вычислений источников данных. Не длительность серверных запросов."
		],
		[
			"tableRefs",
			"Ссылки на таблицы",
			"arrays",
			[6, 30],
			"Обращения к ссылкам на таблицы, учтённые движком."
		],
		[
			"booleanRules",
			"Логические правила",
			"rules",
			[
				6,
				38,
				1
			],
			"Количество вычислений логических правил условного форматирования."
		],
		[
			"gradientRules",
			"Цветовые шкалы",
			"rules",
			[
				6,
				38,
				2
			],
			"Количество вычислений градиентных правил условного форматирования."
		],
		[
			"simpleBooleanRules",
			"Простые логические",
			"rules",
			[
				6,
				38,
				3
			],
			"Отдельная категория simple boolean движка. Не прибавляем к общему числу правил без доказанной непересекаемости."
		],
		[
			"simpleGradientRules",
			"Простые шкалы",
			"rules",
			[
				6,
				38,
				4
			],
			"Отдельная категория simple gradient движка. Не самостоятельный замер времени правила."
		]
	].map(([id, label, group, path, help]) => ({
		id,
		label,
		group,
		path,
		help
	}));
	function decodeExperimentalStats(wire) {
		if (!Array.isArray(wire) || wire[10] != null && !Array.isArray(wire[10])) throw Error("Неизвестная схема экспериментальных метрик.");
		const seen = /* @__PURE__ */ new Set();
		const phases = (wire[10] ?? []).map((phase, index) => {
			if (!Array.isArray(phase)) throw Error("Неизвестная схема экспериментальной фазы.");
			if (count(phase[1]) === null || seen.has(phase[1])) throw Error("Неизвестный или повторный тип экспериментальной фазы.");
			seen.add(phase[1]);
			return {
				index,
				type: count(phase[1]),
				elapsedMs: finite(phase[2]),
				values: Object.fromEntries(metrics.map((metric) => [metric.id, count(metric.path.reduce((value, key) => Array.isArray(value) ? value[key] : void 0, phase))])),
				cache: Array.isArray(phase[31]) ? Array.from({ length: 14 }, (_, i) => {
					const value = phase[31][i + 1];
					return [
						8,
						11,
						14
					].includes(i + 1) ? Array.isArray(value) ? value.map(count) : null : [2, 4].includes(i + 1) ? finite(value) : count(value);
				}) : null
			};
		});
		const functions = [
			[1, 1],
			[2, 2],
			[3, 3],
			[6, 53]
		].map(([type, field]) => ({
			type,
			available: Array.isArray(wire[field]),
			entries: Array.isArray(wire[field]) ? wire[field].flatMap((item) => Array.isArray(item) && typeof item[1] === "string" && count(item[2]) !== null ? [{
				name: item[1],
				count: item[2]
			}] : []) : [],
			malformed: Array.isArray(wire[field]) && wire[field].some((item) => !Array.isArray(item) || typeof item[1] !== "string" || count(item[2]) === null)
		}));
		return {
			phases,
			functions,
			scope: "latest-native-snapshot",
			available: phases.some((p) => Object.values(p.values).some((v) => v !== null)) || functions.some((group) => group.available)
		};
	}
	function summarizeMetrics(phases) {
		return Object.fromEntries(metrics.map((metric) => {
			const known = phases.map((phase) => phase.values[metric.id]).filter((value) => value !== null && value !== void 0);
			const total = known.reduce((sum, value) => sum + value, 0);
			return [metric.id, {
				value: known.length && Number.isSafeInteger(total) ? total : null,
				partial: known.length > 0 && known.length !== phases.length
			}];
		}));
	}
	function readLatencyStats(g) {
		const descriptor = Object.getOwnPropertyDescriptor(g, "docs_latencyStats");
		if (!descriptor || !("value" in descriptor) || !descriptor.value || typeof descriptor.value !== "object") return {
			entries: [],
			reason: "Google не предоставил журнал"
		};
		const fields = Object.getOwnPropertyDescriptors(descriptor.value), keys = Object.keys(fields);
		const entries = keys.slice(0, 1e3).map((key) => {
			const list = fields[key].value;
			return {
				name: key.slice(0, 250),
				values: Array.isArray(list) ? Array.from({ length: Math.min(list.length, 3) }, (_, i) => {
					const value = Object.getOwnPropertyDescriptor(list, String(Math.max(0, list.length - 3) + i))?.value;
					if (typeof value === "number") return Number.isFinite(value) ? value : "Недоступно";
					if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value;
					return value === null || typeof value === "boolean" ? value : "Неподдерживаемый тип";
				}) : ["Неподдерживаемый тип"]
			};
		});
		return {
			entries,
			truncated: keys.length > 1e3,
			reason: entries.length ? null : "В журнале пока нет записей"
		};
	}
	function decodeExperimentalSignal(message) {
		const data = message?.[1];
		if (!data || typeof data !== "object" || Array.isArray(data)) return null;
		const percent = finite(data.percent);
		if (message[0] === 4) return {
			kind: "progress",
			value: {
				stage: count(data.stage),
				percent: percent !== null && percent <= 100 ? percent : null,
				dirtyEstimate: count(data.numDirtyCellsEstimate),
				sentAt: finite(data.messageSentTimestampMs)
			}
		};
		if (message[0] === 17) {
			const checkpoints = data.latencyCheckpointEntries, durations = data.latencyDurationEntries;
			const start = finite(checkpoints?.[117171]), end = finite(checkpoints?.[117172]);
			return {
				kind: "startup",
				value: {
					fetchMs: start !== null && end !== null && end >= start ? end - start : null,
					instantiateMs: finite(durations?.[117173]),
					initializeMs: finite(durations?.[117175]),
					failures: count(data.instantiateFailureCount)
				}
			};
		}
		return null;
	}
	var experimentalTools = [
		{
			id: "latency",
			label: "Журнал задержек",
			help: "docs_latencyStats хранит последние три записи на ключ, если Google включил этот журнал. Читаем существующие записи без переключения флагов."
		},
		{
			id: "modelSize",
			label: "Размер модели",
			help: "Показатель штатной панели, полученный с сервера. Это размер модели документа, а не оперативная память или память формулы."
		},
		{
			id: "cache",
			label: "Структура кэшей",
			help: "CacheSizes содержит 14 внутренних полей. Их смысл пока не восстановлен: показываем номера и исходные числа, не называя их байтами или попаданиями в кэш."
		},
		{
			id: "manual",
			label: "Ручной расчёт",
			help: "Восстановлена команда включения и ветка Worker MANUAL_CALC. Доступ зависит от femc. Переключение в живой таблице ещё не проверено; экспериментальный раздел этот режим не включает.",
			reason: "Код подтверждён · запуск не проверен"
		},
		{
			id: "debug",
			label: "Debug menu",
			help: "Скрытое меню «Отладка» найдено в живой странице. Рабочие команды Sheets и способ их включения не подтверждены. Простое снятие скрытия этого не доказывает.",
			reason: "Меню скрыто · команды не проверены"
		},
		{
			id: "timeline",
			label: "Отладка календарного Timeline",
			help: "Это календарная шкала карточек, не профайлер формул. В проверенной сборке Google явно отключил debug-кнопку в шаблоне; обработчик её команды не найден.",
			reason: "Отключено в коде Google"
		},
		{
			id: "debugFormulas",
			label: "Служебные формулы",
			help: "Имена DEBUG_SLEEP и других функций встречаются в реестре. Возможность использовать их в обычной таблице не доказана.",
			reason: "Доступ не подтверждён"
		},
		{
			id: "cellOperations",
			label: "Операции и память ячейки",
			help: "Готовые счётчики всех операций, памяти и времени подвыражений для отдельного адреса не найдены. Агрегаты нельзя приписать карточке формулы.",
			reason: "Метрика не найдена"
		}
	];
	//#endregion
	//#region userscript/src/worker-results.js
	function decodeWorkerStats(wire) {
		if (!Array.isArray(wire) || wire[10] != null && !Array.isArray(wire[10]) || (wire[10]?.length ?? 0) > 64) throw Error("Изменилась схема статистики Worker Google.");
		const stats = [];
		stats[9] = (wire[10] ?? []).map((phase) => {
			if (!Array.isArray(phase) || phase[11] != null && !Array.isArray(phase[11]) || (phase[11]?.length ?? 0) > 100) throw Error("Изменилась схема фаз Worker Google.");
			const result = [];
			result[0] = phase[1];
			result[1] = phase[2];
			result[3] = phase[4];
			result[4] = phase[5];
			result[10] = (phase[11] ?? []).map((item) => {
				if (!Array.isArray(item) || item[2] != null && !Array.isArray(item[2])) throw Error("Изменилась схема адресных замеров Worker Google.");
				return [item[1], item[2] == null ? null : [
					item[2][1],
					item[2][2],
					item[2][3]
				]];
			});
			return result;
		});
		return decodeNativeStats(stats);
	}
	function breakdown(phases) {
		return [...calculationTypes.map((type, index) => {
			const matching = phases.filter((phase) => phase.type === index + 1);
			return {
				...type,
				ms: matching.length && matching.every((phase) => phase.elapsedMs != null) ? matching.reduce((sum, phase) => sum + phase.elapsedMs, 0) : null
			};
		}), {
			id: "load",
			label: "Загрузка",
			color: "#58a55c",
			ms: null
		}];
	}
	function createWorkerResults(now = Date.now) {
		let latest = null, sequence = 0, since = null, error = null;
		let experimental = null;
		const experimentalSignals = {};
		const top = createSessionTop(), totals = /* @__PURE__ */ new Map();
		return {
			receive(message, experimentalSupported = false, engineVerified = true) {
				if (experimentalSupported) {
					const signal = decodeExperimentalSignal(message);
					if (signal) experimentalSignals[signal.kind] = {
						...signal.value,
						receivedAt: now()
					};
				}
				if (!Array.isArray(message) || message[0] !== 1 || message[1]?.["1"] !== true || message[1]?.["6"] == null) return;
				try {
					if (experimentalSupported) try {
						experimental = {
							...decodeExperimentalStats(message[1]["6"]),
							engineVerified,
							updatedAt: now()
						};
					} catch (failure) {
						experimental = {
							available: false,
							phases: [],
							functions: [],
							error: failure.message,
							engineVerified,
							updatedAt: now()
						};
					}
					const data = decodeWorkerStats(message[1]["6"]);
					if (!data.phases.length) return;
					const updatedAt = now();
					since ??= updatedAt;
					latest = {
						...data,
						updatedAt,
						sequence: ++sequence,
						breakdown: breakdown(data.phases)
					};
					top.add(data.observations);
					for (const phase of data.phases) {
						if (![
							1,
							2,
							3
						].includes(phase.type)) continue;
						const old = totals.get(phase.type);
						totals.set(phase.type, {
							type: phase.type,
							elapsedMs: phase.elapsedMs == null || old?.elapsedMs === null ? null : (old?.elapsedMs ?? 0) + phase.elapsedMs
						});
					}
					error = null;
				} catch (failure) {
					error = failure.message;
				}
			},
			read() {
				return {
					...latest ?? {
						available: false,
						phases: [],
						observations: [],
						updatedAt: null,
						sequence,
						breakdown: breakdown([])
					},
					error,
					experimental,
					experimentalSignals,
					session: {
						...top.read(),
						breakdown: breakdown([...totals.values()]),
						topObservedSince: since
					}
				};
			}
		};
	}
	//#endregion
	//#region userscript/src/native/shapes.js
	var tokenPattern = /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S/g;
	var identifierPattern = /^[A-Za-z_$][\w$]*$/;
	var keywords = new Set("break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield async await of undefined arguments".split(" "));
	var messageId = /^"[A-Za-z0-9$]{1,3}[_`0-9]"$/;
	var source$1 = (fn) => typeof fn === "function" ? Function.prototype.toString.call(fn) : "";
	var tokenize = (text) => text.match(tokenPattern) ?? [];
	var isName = (token) => identifierPattern.test(token) && !keywords.has(token);
	function normalized(text, { messageIds = false, keepKeywords = false } = {}) {
		return tokenize(text).map((token) => identifierPattern.test(token) && (!keepKeywords || !keywords.has(token)) ? "N" : messageIds && messageId.test(token) ? "\"I\"" : token).join(" ");
	}
	async function sha256(text) {
		const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
		return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	async function hasShape(fn, expected, options) {
		return typeof fn === "function" && await sha256(normalized(source$1(fn), options)) === expected;
	}
	function align(reference, live) {
		const a = tokenize(reference), b = tokenize(live);
		if (a.length !== b.length) return null;
		for (let i = 0; i < a.length; i++) {
			const x = a[i], y = b[i];
			if (isName(x) ? !isName(y) : x !== y && !(messageId.test(x) && messageId.test(y))) return null;
		}
		return { at(snippet) {
			const parts = tokenize(snippet), target = parts.indexOf("@");
			if (target < 0) throw Error(`Фрагмент без @: ${snippet}`);
			parts.splice(target, 1);
			for (let i = 0; i + parts.length <= a.length; i++) if (parts.every((part, j) => a[i + j] === part)) return b[i + target];
			throw Error(`Фрагмент не найден в эталоне: ${snippet}`);
		} };
	}
	//#endregion
	//#region userscript/src/native/workers.js
	var workers = [
		{
			host: "/2147245981-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
			stats: true,
			counters: false,
			evidence: "docs/WORKER-GUIDE.md",
			extension: true
		},
		{
			host: "/240162998-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
			stats: true,
			counters: true,
			evidence: "docs/ENGINE-COUNTERS-2026-09-22.md"
		},
		{
			host: "/1548196417-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
			stats: true,
			counters: false,
			evidence: "research/native-build-2026-09-23-manifest.json"
		},
		{
			host: "/855087257-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
			stats: true,
			counters: true,
			evidence: "research/native-build-2026-09-25-manifest.json"
		},
		{
			host: "/1040291595-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
			stats: true,
			counters: true,
			evidence: "research/native-build-2026-09-29-manifest.json"
		}
	];
	var verifiedGlue = [{
		sha256: "6bcf40ff27a63790e6184f4a81d2b1d6f5d165518fb23768d28f90b0acd055ed",
		evidence: "research/native-build-2026-09-29-manifest.json"
	}, {
		sha256: "6addda89a4371f2f4324cb1b83a91789e77b311d4be7dc84ae89efd4d1f1d9e8",
		evidence: "research/native-build-ggV6-manifest.json"
	}];
	var extensionHost = workers.find((worker) => worker.extension).host;
	var workerHostOf = (pathname) => pathname.match(/\/\d+-calcworkerhost[^/]*\.js$/)?.[0] ?? null;
	function workerProfile(pathname) {
		const listed = workers.find((worker) => pathname.endsWith(worker.host));
		return listed ? {
			...listed,
			engineVerified: listed.counters
		} : null;
	}
	async function verifyWorkerGlue(text, host) {
		if (typeof text !== "string") return null;
		const digest = await sha256(text.replace(/[0-9]+/g, "0"));
		return verifiedGlue.some((glue) => glue.sha256 === digest) ? {
			host,
			stats: true,
			counters: true,
			engineVerified: false,
			verification: "glue"
		} : null;
	}
	//#endregion
	//#region userscript/src/timing.js
	var settingPrefix = "sheets-scope-userscript:enabled:";
	function bookIdFromURL(url) {
		const parsed = new URL(url);
		return parsed.origin === "https://docs.google.com" ? /^\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]+)\/edit\/?$/.exec(parsed.pathname)?.[1] ?? null : null;
	}
	function preferences(storage, bookId) {
		const key = settingPrefix + bookId;
		return {
			enabled: () => storage.getItem(key) !== "0",
			set(enabled) {
				if (enabled) storage.removeItem(key);
				else storage.setItem(key, "0");
			}
		};
	}
	function timingReason(setup) {
		if (setup.status === "disabled") return "Замеры в этой таблице выключены. Нажмите «Подключить и перезагрузить».";
		if (setup.status === "waiting") return "Вычисления Google ещё не подключены. Дождитесь загрузки таблицы и повторите.";
		if (setup.status === "stopped") return "Замеры остановлены. Перезагрузите таблицу.";
		if (setup.error) return setup.error;
		return "Нет подключения к вычислениям Google. Перезагрузите таблицу.";
	}
	function installTiming(win, enabled) {
		const nativeWorker = win.Worker, restores = /* @__PURE__ */ new Set(), listeners = /* @__PURE__ */ new Set();
		const results = createWorkerResults();
		const initial = {
			status: enabled ? "waiting" : "disabled",
			enabledWorkers: 0,
			error: null
		};
		let proxy, observedWorkers = 0, stopped = false, startupTimer, workerHost = null;
		const nativeFetch = win.fetch;
		async function verifyHost(href, host) {
			let timer;
			try {
				if (typeof nativeFetch !== "function") throw Error("fetch недоступен");
				const check = (async () => {
					const response = await Reflect.apply(nativeFetch, win, [href, {
						credentials: "same-origin",
						cache: "force-cache"
					}]);
					if (!response?.ok) throw Error(`HTTP ${response?.status}`);
					return verifyWorkerGlue(await response.text(), host);
				})();
				const timeout = new Promise((_, reject) => {
					timer = win.setTimeout(() => reject(Error("истекло время ожидания")), 1e4);
				});
				return await Promise.race([check, timeout]);
			} catch (error) {
				initial.status = "unsupported";
				initial.error = `Не удалось проверить новый Worker Google (${error.message}). Замеры не включены.`;
				return null;
			} finally {
				win.clearTimeout?.(timer);
			}
		}
		function shared() {
			if (workerHost && workerHost !== extensionHost) return null;
			const state = win.__sheetsScopeTimingSetup;
			return state?.version === 1 && ["waiting", "enabled"].includes(state.status) ? state : null;
		}
		function stop() {
			stopped = true;
			win.clearTimeout?.(startupTimer);
			for (const restore of restores) restore();
			for (const remove of listeners) remove();
			listeners.clear();
			if (win.Worker === proxy) win.Worker = nativeWorker;
		}
		function status() {
			const existing = shared();
			if (stopped) return {
				...initial,
				status: "stopped",
				observedWorkers,
				workerHost,
				source: "userscript"
			};
			if (initial.status === "unsupported" || initial.status === "missed") return {
				...initial,
				observedWorkers,
				workerHost,
				source: "userscript"
			};
			if (existing) return {
				status: existing.status === "enabled" && !observedWorkers ? "waiting" : existing.status,
				enabledWorkers: existing.enabledWorkers,
				observedWorkers,
				workerHost,
				source: "extension",
				error: existing.error ?? null
			};
			return {
				...initial,
				observedWorkers,
				workerHost,
				source: "userscript"
			};
		}
		if (enabled || shared()) {
			if (typeof nativeWorker !== "function") {
				initial.status = "unsupported";
				initial.error = "Worker недоступен в контексте страницы.";
			} else {
				proxy = new Proxy(nativeWorker, { construct(target, args, newTarget) {
					const worker = Reflect.construct(target, args, newTarget);
					if (stopped) return worker;
					let url;
					try {
						url = new URL(args[0], win.location.href);
					} catch {
						return worker;
					}
					const host = url.origin === "https://docs.google.com" ? workerHostOf(url.pathname) : null;
					if (!host) return worker;
					if (workerHost && workerHost !== host) {
						initial.status = "unsupported";
						initial.error = "Google изменил Worker. Нужна новая проверка совместимости.";
						return worker;
					}
					workerHost = host;
					let profile = workerProfile(url.pathname), pending = null;
					if (!enabled && !shared()) return worker;
					const receive = (event) => {
						if (profile) results.receive(event.data, profile.counters, profile.engineVerified);
					};
					worker.addEventListener("message", receive);
					listeners.add(() => worker.removeEventListener("message", receive));
					observedWorkers++;
					if (shared()) return worker;
					const nativePost = worker.postMessage;
					const queue = [];
					let bootstrapped = false;
					const restore = () => {
						if (worker.postMessage === post) worker.postMessage = nativePost;
						restores.delete(restore);
						for (const item of queue.splice(0)) try {
							Reflect.apply(nativePost, item.receiver, item.args);
						} catch {}
					};
					if (!profile) pending = verifyHost(url.href, host).then((found) => {
						profile = found;
						if (!found && initial.status !== "unsupported") {
							initial.status = "unsupported";
							initial.error = "Google изменил Worker: код обвязки отличается от проверенного. Нужна новая проверка совместимости.";
						}
						const held = queue.splice(0);
						pending = null;
						for (const item of held) try {
							forward(item.receiver, item.args);
						} catch {}
						if (!found || bootstrapped) restore();
					});
					function post(...postArgs) {
						if (!pending) return forward(this, postArgs);
						const options = postArgs[1], transfer = Array.isArray(options) ? options : options?.transfer ?? [];
						const copy = structuredClone({
							message: postArgs[0],
							transfer
						}, { transfer });
						queue.push({
							receiver: this,
							args: postArgs.length > 1 ? [copy.message, copy.transfer] : [copy.message]
						});
					}
					function forward(receiver, postArgs) {
						const message = postArgs[0];
						if (stopped || !profile || !Array.isArray(message) || message[0] !== 6) return Reflect.apply(nativePost, receiver, postArgs);
						bootstrapped = true;
						let forwarded = postArgs, adjusted = false;
						try {
							const flags = JSON.parse(message[1]?.flags?.ritz_ef);
							if (typeof flags.fept !== "boolean") throw Error("Изменилась схема bootstrap Worker.");
							forwarded = postArgs.slice();
							forwarded[0] = message.slice();
							forwarded[0][1] = {
								...message[1],
								flags: {
									...message[1].flags,
									ritz_ef: JSON.stringify({
										...flags,
										fept: true
									})
								}
							};
							adjusted = true;
						} catch (error) {
							initial.status = "unsupported";
							initial.error = error.message;
						}
						const result = Reflect.apply(nativePost, receiver, forwarded);
						if (adjusted) {
							initial.status = "enabled";
							initial.enabledWorkers++;
						}
						restore();
						return result;
					}
					worker.postMessage = post;
					restores.add(restore);
					return worker;
				} });
				win.Worker = proxy;
				startupTimer = win.setTimeout(() => {
					if (!observedWorkers || !shared() && !initial.enabledWorkers) {
						for (const restore of restores) restore();
						if (win.Worker === proxy) win.Worker = nativeWorker;
						if (initial.status === "waiting" || initial.status === "disabled" && shared()) {
							initial.status = "missed";
							initial.error = "Раннее подключение пропущено. Перезагрузите таблицу после обновления скрипта.";
						}
					}
				}, 3e4);
			}
		}
		return {
			status,
			stop,
			results: () => results.read(),
			ready() {
				const value = status();
				return value.status === "enabled" && value.enabledWorkers > 0 && observedWorkers > 0;
			}
		};
	}
	var archived_2147245981_default = {
		QC: "a9a465ddbd08079324d97d3730e2fa831f3437854464893f26797542e58f5ea3",
		Usd: "2c40a04c942fb0dc99e0b2ddf1c502fcc7f0c17d557ece9ac63ea6fa9ce502f0",
		wtc: "a775eff79fd584d6c724467eafe0f81badd7bd808577c7885745d04caaac3107",
		dx: "1d0ea3cd9f06fd9e7f5528e6da1a89f4de37fa795968ee11c215d661add34757",
		AA: "3753c4947fd5b372388a40b336688348f553f4c810337e27ab7f0dacd83d602a",
		ns: "347f557470dd6b695aa44420ae3833b89c5973cbcce43428808ecaab6e4cf2df",
		Woh: "824b0d739d975f353e915080dfdd2fff8ea3715ac6cbf733bce2f0b80f8f0689",
		Fj: "de9c6c664237e217fddb9817c7ffccb3eb31fc727bc8bc4a06246cf440bfa270",
		oP: "c5f42592aefba2890ac242f84de957e46b3bf7119137b8d06f2e1d69e3a59ac8",
		DP: "44e8843c8d3838ecd249d470d4a7520a7f1264b9b1dc0766457bb638bf27b7d7",
		pP: "3d532a8edb24b6e4d6e88da5617ece474cf6ff0a90f7202f9ed7e76c67030da2",
		qP: "32ec005d8c8d2a7444d20ffc186f84eb826f4453611cee9fb07c11a97825fe0f",
		jmg: "4c15c2831d54a13b858b719270520607a33305eaf75a504600e8608aa55b660c",
		nc: "fb815e0a18e427ae7d9bda383e4cdbf7b4ad9d72eeb0ef820c729d68dc697ec4",
		Hc: "95a10a1d49d95c542ab86369c1c606e2414e417367f346f955e0ee3926458c85",
		ie: "0c2d40f60388c5dff8a3e6a8555cba54c7bf592d99d844942f4dff88b3b89f35",
		me: "7eae984fd0aa8021f4bf3700d1cb4fa491c8ebf074f0bf872dc621a5455ded8e",
		On: "09d97d34b57308ecbcb6e028bdf35e7b3553e2e26df4be2ed5a251f8e014d254",
		Sb: "93e6ba4160b59db13d70d60bc88e472d8a11853f895868119140427f886c09ff",
		dc: "8bc6ad73db2e4e7b7eb601c131a47c5fd63ba7d5a2e496bc39b39c55ac85137b",
		oBe: "e0ae0580cdd692560446f87dad7fcafedc6aefd85e9471371062b10c35c0e024",
		t6y: "f81c97d3c953c750b226c90235a5727febe3977a39c5c02f131f86b1c6a0bc6a",
		Mn: "87fc92c62d3ff5fe7f63631d268ec02089d9225859e2b5fb4657c25ff4a42802",
		a7y: "ae9b578f93eb89d52d966f2eff6d2c2fd94441df8f08d41781b269deaed62e58",
		wwe: "c92cbc1fe17f4d0e93f0834d88c842b32803d78b3e74d6b572a23a4c290223a3",
		LFd: "632890aa3ddf037507882b6745959104bd2a1831357e160930acf4551bdd6cd0",
		aggregateJSON: "0796dc4c032c31192c0cf8f249f4e9570cf90f6ad83991b87104deb23c7a0d5d",
		t4e: "f42ea1d3c420d0e9550abed8a40355fad112ef6cd4026975ec2b11d16bab1fd9",
		NNc: "2254c9a4ddf1ab9f29cfe7f9eabf6cbec5199c03de030ff19e561ef841af415c",
		Oqb: "b0f086edd7a596dff05e4f579ee5a74952f384acb73f38d02064d2d2c0acf56b",
		T6y: "a92ab928389de9e507e39dc7094d906dad0c70f8f2daf1f7c488934eea7d2bb8",
		d7y: "3379e7b4402bfec4ab1501d805aaf0df3a7e5ac3a7db4f32b7fe3adfb71ef004",
		e7y: "32d84d8a55fd42d4a761a84c6c2b8766d443dde75f30bc19bedda8f4af5db051",
		g7y: "2ae352f6b6b1defa930c772033921c708b5fa0a8abcdf456878a882062b39781",
		Rl: "d0c56fd2c0ee8a25cbf09a913182d54f452c8b8325c178eefa225ecfed11cc62",
		initializeView: "ce84d7f52219908fcddd4bacbbf84ed8d103c937dc60b75c6583cedfe3d5332b",
		Abg: "7dabad57bc84a36070eda536b6630c5bdb983947ab280b4984d61f459d091061",
		T5h: "00af1e84342abb4d7f76e25ce25828cf0a45e2d8500f6c07e4c6694377818c20"
	};
	var ggV6s0daVJw_default = {
		id: "ggV6s0daVJw",
		workerHost: "/240162998-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
		globals: {
			"QC": "PC",
			"Usd": "Hsd",
			"wtc": "htc",
			"dx": "dx",
			"AA": "AA",
			"ns": "os",
			"Woh": "poh",
			"Fj": "Fj",
			"oP": "pP",
			"DP": "AP",
			"pP": "qP",
			"qP": "rP",
			"jmg": "Jlg",
			"tmg": "Tlg",
			"T5h": "s5h",
			"Abg": "$ag",
			"Rl": "Pl",
			"I2i": "Z1i"
		},
		methods: {
			"t4e": "e5e",
			"NNc": "uOc",
			"Oqb": "lrb",
			"wm": "xm",
			"oO": "sO",
			"Vod": "Cpd"
		},
		fields: {
			"sheetName": "Yj",
			"sheetId": "Ta",
			"storageReady": "Bj",
			"count": "bx",
			"openContext": "pC",
			"openService": "mf"
		},
		fingerprints: {
			"Fwd": "c41f190df266bbb521ca6946262b466b228246fe87c67b23264fdc69e3671f62",
			"analysisConstructor": "57f03f7d365a8bcf7ec9d71c2056edb1ca8690c67adc2e0b9f2bbcef9c8cc9d7",
			"QC": "6158fe850ecc2c283d4317cd153cfb077e731a97c70c506b9b20baeca1728868",
			"Usd": "a4f42067e130f63f1cde1b63d08bac0e8c43248852fd52cf08f50d1ff5b61249",
			"wtc": "fec40c9de114da9ac826fcece498d51a0149b07997e777b1a99f3bf2774f71d7",
			"dx": "bf90fbd6a8bd4a5efef7a3f7bfc2d8aaf3a5515f6568e2557a072a7b882de2c7",
			"AA": "3753c4947fd5b372388a40b336688348f553f4c810337e27ab7f0dacd83d602a",
			"ns": "b89cebb683bdd917dd73ae17415b3627f65630de3a16ea9724b788de6ea69677",
			"Woh": "7096a0dde4d0264c9729cdc1f9509787d72220aa1e36bfc9f52c77594266e5e9",
			"Fj": "de9c6c664237e217fddb9817c7ffccb3eb31fc727bc8bc4a06246cf440bfa270",
			"oP": "5313707742c41316ed279d37f23b80e79e1678c0509a78591a65044f4580ec00",
			"DP": "0d994dd340d209aa72493a8201e3ef66aa90ef14944cbb08fbed054adc037d25",
			"pP": "1f8373b07f15a25325d20748b3b15dc281bb02ca3d4b4fadc4af62850fd17af9",
			"qP": "b3f58c5ac5da4dea51149993e09544869c50c51ee5226bb87f7ccae19b95a3f9",
			"jmg": "b3282f1537714653a111625981588b683c71716a94b8c17a427ddede3df847fc",
			"T5h": "7d89cb9724b5f9098c368496f9a516ab6941fa14f29ceefd0c9c919956d9e3ae",
			"Abg": "0eee1e01a6e2ec13c1453949fd7b3263922a0086584f9b18838a1bc4ffea1d1b",
			"Rl": "0acab904842d7323936ca387a5bdee6a460086955e028bfaa1a69195bea28793",
			"I2i": "6dfcb312c9a19f53842a2ea70554adb20e2cf72e0bc27818acdb9c433d76d82d",
			"t4e": "4e964f3ed01f84370826fcdfa6cb4d8b714f696a7e76f94d95537ef6cd24d5ec",
			"NNc": "c8deb6d2d9c6a4105a7ef4afe15623748908d44047be63c29be2a4ae220f774c",
			"Oqb": "b0f086edd7a596dff05e4f579ee5a74952f384acb73f38d02064d2d2c0acf56b",
			"wm": "f7d68c5cf03494156de94db3b892ff19a7dab3b2f136ca1908a12d67972132c5",
			"oO": "2516b3169762652f7cbd7ae0f970f3175ad683c7651b2522bba150cf2f9b2a89",
			"Vod": "c3d8314f298a7b27814ca7d76141257df9261d5b230b7b588eb6e51482f91d82"
		}
	};
	var waffle_2026_09_23_default = {
		id: "waffle-2026-09-23",
		workerHost: "/1548196417-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
		appShell: "Da",
		capacity: {
			"grid": "ma",
			"rows": "oa",
			"columns": "qa"
		},
		globals: {
			"QC": "LC",
			"Usd": "jtd",
			"wtc": "Itc",
			"dx": "ax",
			"AA": "yA",
			"ns": "ls",
			"Woh": "Jqh",
			"Fj": "Ej",
			"oP": "WO",
			"DP": "gP",
			"pP": "XO",
			"qP": "YO",
			"jmg": "wog",
			"tmg": "Gog",
			"T5h": "b7h",
			"Abg": "Odg",
			"Rl": "Nl"
		},
		methods: {
			"t4e": "N5e",
			"NNc": "ZOc",
			"Oqb": "Irb",
			"wm": "nm",
			"oO": "wO",
			"Vod": "bqd"
		},
		fields: {
			"sheetName": "ea",
			"sheetId": "ea",
			"bookList": "xU",
			"bookGrid": "Ad",
			"storageReady": "Bj",
			"storage": "ma",
			"count": null,
			"modelStore": "ea",
			"modelQueue": "oa"
		},
		sheetList: "native-book",
		fingerprints: {
			"QC": "ee54c0e037e1be0cab7f686c54d3be6dc99f090b7020f0434d9967e4c9c3dcf3",
			"Usd": "52e7981bcfd9221a3b7a193fd10c8ee02b9f446dafce2d2418132e26d0f1df8a",
			"wtc": "eba84723dfbf73cd95627ae236ed463dc3c3ae055b9d7e864b63d010f91f7809",
			"dx": "05f7497d1e2a556b017cc9050dbedd6f533fc8b308c651be8c414a1ae64717e9",
			"AA": "95827f33ee1c3f32ff57e179dccaa29e4749d459c9cc4a44cb083bde7173470e",
			"ns": "5ce582510ed4fe6c6b33cfa7ab8b4efb9ec369a187b29f0b16bac1ed8de2956f",
			"Woh": "015266029a1acbdeeb47f931f93df814d93a011f2d3ebbd38588b9b4049d56f3",
			"Fj": "18ff80132ab8e0cec95600fb92de053cb466336f35457c9a9476d6bd7ebae994",
			"oP": "5c4317153b604a1d8472bec83cb5f94be06da183a33f68fa0e8f7aecf1e13b35",
			"DP": "7906dfa0d3ae08960bcc174b9bb2cc00696018cdabd0bba04eb1171224989300",
			"pP": "714d81fe5a95e095fb5ce20ac091ae1028ffaf8766a88fb6985fdcaadc3b745a",
			"qP": "9305fd1e655e4e92d4db85285e4be0e887709fcfd2a8997fcf2cd027d6637464",
			"jmg": "f1fb8df98f85f91ceb905dcd68d3145c6da523ea8a460c21e651a37217055973",
			"T5h": "2a8b206ea25dad94ace56c2d5c29ac7dd3647edbbdedceb5c041e4ff12bce9da",
			"Abg": "43800ce197f0becd0a0a716d4138fad1741ff71456b94dfbf16b88759b412ba2",
			"Rl": "2844234d3d64841ef12870a180381448727d76929f02067b92d2246a09b67bd4",
			"t4e": "1a9d155b3c62170b9a99276c005158749568eaacf1cd030554e20276c4939a5b",
			"NNc": "28a83885230a9b778d5db28192f58d1e65361863567c9a935af3f16f929ea7fa",
			"Oqb": "b6808f66977311bc93f6319a355daa3a4027b2ec2c01d617dee5cf2eb93907c1",
			"wm": "a11232bb325f0cddadcef29e65f497526ceda7c502d438f4fd84e491d6fb50d3",
			"oO": "a592142ea3e481a687684d4e3b379072151b489185a332e1a0b62cb487f4a294",
			"Vod": "b23afecc22c8aa2af6d8ca045c36e12fae5d32489da5f42bb57b0b7ca5f9c313"
		}
	};
	//#endregion
	//#region userscript/src/native/discovery.js
	var shapes = {
		t4e: "36024704899410805f4300201f8942b96f34267e207734ffa3a89f13391835b2",
		wm: "c4acedb7235ef3ae04ec1ab92edf8fdb8119c2b37960055c61f7cf93e55da578",
		oO: "764a9d9e70704e68756f62bd31ebe18b36ecd95f6ef7e9097425abc99f2cbd3f",
		Vod: "48f808f42af552c300425ec95c54158a03e3e00360bfbb50912a77ac9bbb48c2",
		NNc: "5a0bf6b4c3f41ea280bf24349de9ff173a99135fa3ef91038822d22a87c2cd60",
		Oqb: "5f2e34a0085c0d61a9caec9680a2bcada9f12ce1ba000a51bfb97ae03f3547b2",
		existsHelper: "e97780dc5d74b9dc1b86616dbca7e420ebedbdf022bfbcbd5c82633c330346e5",
		QC: "f391e153a014c3d7d67f5d9956ebe09fae379a96eb41c77e1731361381ea5973",
		Usd: "737a042a2b6f3b23b860027598cff3b9269f0d8b3f8f61772699ce75680f2220",
		wtc: "4bf6c0d7806e2cedb690f1774044b7ad9e3d31e35d9d3d5f6e095902abfdf57c",
		ns: "753f472a5dd33db4e029b5e7b2583fcbc18fecc8b299b04a7c511d112666ee8f",
		Woh: "16a725dcc7971653654a44a95148545d3ca0bdf78e39cdc311159f483aa943bb",
		Fj: "36c65d240ca4d7daa0b7e577ad4bd8504df70a4cd60c506c2ab9f46b2efc55b7",
		oP: "b2c2e14e85e071751b88358eda7848bbf46834d70f4ceab4f3fb6c98abfae755",
		DP: "e03f46eda1fb116047216b736d7430070bc71f6516f773b1da345c04ce17b2ec",
		pP: "091eda8ef3ca313c03dd4c5e6faab04b95adc10c2bd0b1584f80c623b0b9b424",
		qP: "4d84d2542ebc8debd09f8ac80e9f786d33815f1d1dd9180f5f9f2da00311c671",
		jmg: "2bb727a00e88e57aaf295c24c2c7874e3af5f038bf53cede0b1786e0a8bfbbcc",
		T5h: "127aff38e503adb69e48064b6d324b015b8d57e3e2060dc551de6c1f10e97e75",
		Abg: "c75d23fe7bcbf1513c3f3140dde5b2093dd15e66fa199b724917cd4b383726c5",
		Rl: "cd9d86bc2701a34c0a4eb8457686092757a7644715569860d7808376065868b0"
	};
	var identifier = "[A-Za-z_$][\\w$]*";
	var own$3 = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
	var hash = sha256;
	function readerFields(g, names, bookGrid) {
		const patterns = {
			storage: new RegExp(`^function ${identifier}\\(a\\)\\{${identifier}\\(a\\.(${identifier})\\.(${identifier})\\(\\),"Chunk %s is not loaded",a\\.${identifier}\\);return a\\.\\1\\}$`),
			cell: new RegExp(`^function ${identifier}\\(a,c\\)\\{return a\\.${bookGrid.replace(/\$/g, "\\$")}\\(c\\.${identifier}\\)\\.(${identifier})\\(c\\.${identifier},c\\.${identifier}\\)\\}$`),
			sheetName: new RegExp(`for\\(a=a\\.${identifier}\\.${identifier}\\(\\);a\\.${identifier}\\(\\);\\)\\{let e=a\\.${identifier}\\(\\);if\\(${identifier}\\(c,e\\.${identifier}\\.(${identifier})\\.(${identifier})\\)\\)return e\\.${identifier}\\}return null\\}$`)
		};
		const found = {
			storage: /* @__PURE__ */ new Set(),
			cell: /* @__PURE__ */ new Set(),
			sheetName: /* @__PURE__ */ new Set()
		};
		for (const name of names) {
			const fn = own$3(g, name);
			if (typeof fn !== "function" || fn.length > 2) continue;
			const body = source$1(fn);
			if (body.length > 200) continue;
			for (const [role, pattern] of Object.entries(patterns)) {
				const match = body.match(pattern);
				if (match) found[role].add(JSON.stringify(match.slice(1)));
			}
		}
		const one = (role) => found[role].size === 1 ? JSON.parse([...found[role]][0]) : null;
		const storage = one("storage"), cell = one("cell"), sheetName = one("sheetName");
		return {
			storage: storage?.[0],
			storageReady: storage?.[1],
			cell: cell?.[0],
			sheetNamePath: sheetName ?? void 0
		};
	}
	function registrationIn(app, g) {
		if (!app || typeof app !== "object") return null;
		for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(app))) {
			const shell = descriptor.value;
			if (!shell || typeof shell !== "object") continue;
			const code = source$1(shell.constructor);
			const match = code.match(new RegExp(`\\.${identifier}\\((?:"fept"|'fept')\\)&&(${identifier})\\(this\\.(${identifier}),new (${identifier})\\(`));
			if (!match) continue;
			const [, registerName, hostField, wrapperName] = match;
			const register = own$3(g, registerName), wrapper = own$3(g, wrapperName);
			if (typeof register !== "function" || typeof wrapper !== "function") continue;
			const registryField = source$1(register).match(/a\.([A-Za-z_$][\w$]*)\.set\(/)?.[1];
			const host = own$3(shell, hostField);
			if (!registryField || !(own$3(host, registryField) instanceof Map)) continue;
			const start = match.index + match[0].length;
			let depth = 1, end = start;
			for (; end < code.length && depth; end++) if (code[end] === "(") depth++;
			else if (code[end] === ")") depth--;
			if (depth) continue;
			const args = [], contents = code.slice(start, end - 1);
			let level = 0, from = 0;
			for (let i = 0; i <= contents.length; i++) {
				const char = contents[i];
				if (char === "(") level++;
				else if (char === ")") level--;
				if (char === "," && level === 0 || i === contents.length) {
					const part = contents.slice(from, i).trim();
					if (!new RegExp(`^this(?:\\.${identifier})+(?:\\(\\))?$`).test(part)) {
						args.length = 0;
						break;
					}
					args.push(part);
					from = i + 1;
				}
			}
			if (args.length !== 11) continue;
			return {
				appShell: key,
				hostField,
				registryField,
				registerName,
				wrapperName,
				args
			};
		}
		return null;
	}
	async function discoverNativeBuild(g) {
		const names = Object.getOwnPropertyNames(g);
		const providers = /* @__PURE__ */ new Set();
		for (const name of names) {
			const fn = own$3(g, name);
			if (typeof fn === "function" && fn.length === 0 && new RegExp(`^function ${identifier}\\(\\)\\{return ${identifier}\\("ritzmain"\\)\\}$`).test(source$1(fn))) providers.add(name);
		}
		if (!providers.size) return null;
		const candidates = [];
		for (const name of names) {
			const fn = own$3(g, name);
			if (typeof fn !== "function" || fn.length !== 0) continue;
			const match = source$1(fn).match(new RegExp(`^function ${identifier}\\(\\)\\{return (${identifier})\\(\\)\\.${identifier}\\(\\)\\}$`));
			if (match && providers.has(match[1])) candidates.push([name, fn]);
		}
		if (candidates.length > 20) return null;
		for (const [getterName, getter] of candidates) {
			let model;
			try {
				model = Reflect.apply(getter, g, []);
			} catch {
				continue;
			}
			if (!model || typeof model !== "object") continue;
			const prototype = Object.getPrototypeOf(model);
			if (!prototype) continue;
			const functions = Object.getOwnPropertyNames(prototype).map((name) => [name, own$3(prototype, name)]).filter(([, fn]) => typeof fn === "function");
			const shapeMap = /* @__PURE__ */ new Map();
			for (const [name, fn] of functions) {
				const key = await hash(normalized(source$1(fn)));
				if (!shapeMap.has(key)) shapeMap.set(key, []);
				shapeMap.get(key).push([name, fn]);
			}
			const one = (role) => (shapeMap.get(shapes[role]) ?? []).length === 1 ? shapeMap.get(shapes[role])[0] : null;
			const recalc = one("t4e"), bookGetter = one("wm"), formula = one("NNc"), hasFormula = one("Oqb");
			if (!recalc || !bookGetter || !formula || !hasFormula) continue;
			const recalcSource = source$1(recalc[1]);
			const [, store, accessor] = recalcSource.match(new RegExp(`^function\\(\\)\\{var a=this\\.(${identifier})\\.(${identifier})\\(\\),`)) ?? [];
			const queue = recalcSource.match(new RegExp(`(${identifier})\\(this\\.(${identifier}),(${identifier}),null,18\\)`));
			const range = recalcSource.match(new RegExp(`function\\((${identifier})\\)\\{${identifier}\\(${identifier},(${identifier})\\(\\1\\.(${identifier})\\)\\)\\}`));
			const chain = recalcSource.match(new RegExp(`(${identifier})\\(this\\.(${identifier}),(${identifier})\\((${identifier})\\((${identifier})\\((${identifier})\\((${identifier})\\(\\),0\\),(${identifier})`));
			if (!store || !queue || !range || !chain || chain[2] !== store || chain[8] !== "a") continue;
			const [, Woh, , Fj, oP, DP, pP, qP] = chain;
			const [, jmg, queueField, tmg] = queue;
			const [, , ns, sheetIdField] = range;
			if (queueField === store || !recalcSource.includes(`${oP}(${DP}(${pP}(${qP}(),2),a))`) || !recalcSource.includes(`${oP}(${DP}(${pP}(${qP}(),1),a))`)) continue;
			const book = Reflect.apply(bookGetter[1], model, []);
			const bookList = recalcSource.match(new RegExp(`${identifier}\\(a\\.(${identifier})\\(\\)\\)\\.${identifier}\\(`))?.[1];
			const bookPrototype = book && Object.getPrototypeOf(book);
			const bookGrid = bookPrototype && Object.getOwnPropertyNames(bookPrototype).find((name) => source$1(own$3(bookPrototype, name)).includes("No sheet found with id %s"));
			if (!book || typeof book !== "object" || !bookList || typeof book[bookList] !== "function" || !bookGrid) continue;
			const exists = (shapeMap.get(shapes.oO) ?? []).filter(([, fn]) => {
				const helper = source$1(fn).match(new RegExp(`return (${identifier})\\(this\\.${store}\\.${accessor}\\(\\),${identifier}\\)`))?.[1];
				return helper && typeof own$3(g, helper) === "function";
			});
			const verifiedExists = [];
			for (const entry of exists) {
				const helper = source$1(entry[1]).match(/return ([A-Za-z_$][\w$]*)\(/)?.[1];
				if (await hasShape(own$3(g, helper), shapes.existsHelper)) verifiedExists.push(entry);
			}
			const sheetType = (shapeMap.get(shapes.Vod) ?? []).filter(([, fn]) => {
				const method = source$1(fn).match(new RegExp(`this\\.${store}\\.${accessor}\\(\\)\\.(${identifier})\\(a\\)\\.${identifier}\\(\\)`))?.[1];
				return method && source$1(own$3(bookPrototype, method)).includes("Sheet not found");
			});
			if (verifiedExists.length !== 1 || sheetType.length !== 1) continue;
			const globals = {
				dx: getterName,
				ns,
				Woh,
				Fj,
				oP,
				DP,
				pP,
				qP,
				jmg,
				tmg
			};
			if (typeof own$3(g, tmg) !== "object") continue;
			let valid = true;
			for (const role of [
				"ns",
				"Woh",
				"Fj",
				"oP",
				"DP",
				"pP",
				"qP",
				"jmg"
			]) if (!await hasShape(own$3(g, globals[role]), shapes[role])) valid = false;
			if (!valid) continue;
			for (const [role, marker] of [
				["T5h", "\"CalcApply\""],
				["Abg", "\"fecw\""],
				["Rl", "NaN"]
			]) {
				const matches = [];
				for (const name of names) {
					const fn = own$3(g, name);
					if (source$1(fn).includes(marker) && await hasShape(fn, shapes[role], { messageIds: role === "T5h" })) matches.push(name);
				}
				if (matches.length === 1) globals[role] = matches[0];
			}
			const methods = {
				t4e: recalc[0],
				wm: bookGetter[0],
				oO: verifiedExists[0][0],
				Vod: sheetType[0][0],
				NNc: formula[0],
				Oqb: hasFormula[0]
			};
			const fingerprints = {};
			for (const [role, name] of Object.entries(globals)) if (typeof own$3(g, name) === "function") fingerprints[role] = await hash(source$1(own$3(g, name)));
			for (const [role, name] of Object.entries(methods)) fingerprints[role] = await hash(source$1(own$3(prototype, name)));
			const registration = registrationIn(g.waffle_api?.getInstanceOfApp?.(), g);
			if (registration) {
				const dispatcher = names.find((name) => source$1(own$3(g, name)).includes("\"show-performance-tool-sidebar\"") && source$1(own$3(g, name)).length < 120);
				if (dispatcher && await hasShape(own$3(g, registration.registerName), shapes.QC) && await hasShape(own$3(g, registration.wrapperName), shapes.Usd) && await hasShape(own$3(g, dispatcher), shapes.wtc)) {
					Object.assign(globals, {
						QC: registration.registerName,
						Usd: registration.wrapperName,
						wtc: dispatcher
					});
					for (const role of [
						"QC",
						"Usd",
						"wtc"
					]) fingerprints[role] = await hash(source$1(own$3(g, globals[role])));
				}
			}
			return {
				id: "auto-structural",
				workerHost: null,
				globals,
				methods,
				fingerprints,
				sheetList: "native-book",
				registration,
				appShell: registration?.appShell,
				capacity: {
					grid: "ma",
					rows: "oa",
					columns: "qa"
				},
				fields: {
					sheetId: sheetIdField,
					bookList,
					bookGrid,
					modelStore: store,
					modelQueue: queueField,
					...readerFields(g, names, bookGrid)
				}
			};
		}
		return null;
	}
	function resolveRegistrationArg(shell, expression) {
		const parts = expression.replace(/^this\./, "").split(".");
		let value = shell, receiver = null;
		for (const part of parts) {
			receiver = value;
			const call = part.endsWith("()");
			value = receiver?.[call ? part.slice(0, -2) : part];
			if (call) {
				if (typeof value !== "function" || value.length !== 0) throw Error("Изменилась регистрация панели Google.");
				value = Reflect.apply(value, receiver, []);
			}
		}
		return value;
	}
	//#endregion
	//#region userscript/src/native/builds.js
	var builds = [
		{
			id: "archived-2147245981",
			workerHost: "/2147245981-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
			globals: {},
			methods: {},
			fields: {
				sheetName: "Xj",
				sheetId: "Sa",
				storageReady: "Aj",
				count: "Xw",
				openContext: "SC",
				openService: "kf"
			},
			fingerprints: archived_2147245981_default
		},
		ggV6s0daVJw_default,
		waffle_2026_09_23_default
	];
	function createNativeBindings(g) {
		const hashes = /* @__PURE__ */ new WeakMap();
		let selected = null, selector = null;
		async function digest(fn) {
			if (typeof fn !== "function") return null;
			if (!hashes.has(fn)) {
				const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Function.prototype.toString.call(fn)));
				hashes.set(fn, Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join(""));
			}
			return hashes.get(fn);
		}
		async function select() {
			if (selected && selector === g[selected.globals.dx ?? "dx"]) return selected;
			let build = null;
			for (const candidate of builds) {
				const getter = g[candidate.globals.dx ?? "dx"];
				if (await digest(getter) === candidate.fingerprints.dx) {
					build = candidate;
					break;
				}
			}
			build ??= await discoverNativeBuild(g);
			if (!build) throw Error("Структура расчёта Google изменилась. Автопоиск не нашёл подтверждённую цепочку. Нужна проверка адаптера.");
			selected = build;
			selector = g[build.globals.dx ?? "dx"];
			return build;
		}
		const symbol = (role) => g[selected?.globals[role] ?? role];
		const member = (role) => selected?.methods[role] ?? role;
		return {
			select,
			symbol,
			member,
			get build() {
				return selected;
			},
			async verify(roles, objects = {}) {
				const build = await select();
				for (const role of roles) {
					const fn = objects[role] ?? symbol(role);
					if (!build.fingerprints[role] || typeof fn !== "function") throw Error(`Функция Sheets недоступна (${role}, ${build.id}).`);
					if (await digest(fn) !== build.fingerprints[role]) throw Error(`Google изменил функцию (${role}, ${build.id}). Нужна проверка адаптера.`);
				}
			},
			call(role, ...args) {
				return Reflect.apply(symbol(role), g, args);
			},
			method(receiver, role, ...args) {
				return Reflect.apply(receiver[member(role)], receiver, args);
			}
		};
	}
	//#endregion
	//#region userscript/src/request-state.js
	function observeRequest(request, updatedAt, busy, now, sequence) {
		if (!["waiting", "queued-without-measurements"].includes(request?.state)) return request;
		if ((request.baselineKind === "sequence" ? sequence > request.baseline : updatedAt > request.baseline) && updatedAt >= request.startedAt && !busy && now - request.startedAt < 12e4) return {
			...request,
			state: "new-result",
			resultAt: updatedAt,
			resultSequence: sequence
		};
		if (request.state === "waiting" && now - request.startedAt >= 12e4) return {
			...request,
			state: "timeout"
		};
		return request;
	}
	function createLaunchGuard() {
		let launching = false;
		return async function launch(action) {
			if (launching) throw Error("Запуск расчёта уже выполняется.");
			launching = true;
			try {
				return await action();
			} finally {
				launching = false;
			}
		};
	}
	//#endregion
	//#region userscript/src/native/relation-bindings.js
	var roles$2 = {
		build: "ggV6s0daVJw",
		provenance: "research/archive/native-build-ggV6-2026-09-22/ritzmain.js, core.js, live-symbols.json; recorded=true means the SHA equals a live-verified fingerprint",
		roles: {
			"cell": {
				"owner": "grid",
				"source": "function(a,c){Ep()&&hj(a>=0,\"row position cannot be negative (got: %s)\",a);return Qt(this).w_(a,c)}",
				"sha": "73afdfb75542254fc42b59fcdfa4896404f6efd5a393948e33f4580e3ea31e8e",
				"recorded": true
			},
			"chunkRead": {
				"owner": "chunk",
				"source": "function(a,c){aYf(this,a,c);return pTf(this.oa,a,c)}",
				"sha": "fd8efa9b195db4f091e954167f85e464bb003a286ca6ba585d33f15b4b40d3f6",
				"recorded": true
			},
			"chunkQuery": {
				"owner": "chunk",
				"source": "function(a,c,e){e=QXf(e);(c&1)>0&&(e.ma=1,iMf(this.Ea.ma,a,e));(c&2)>0&&(e.ma=2,iMf(this.Ca.ma,a,e));(c&4)>0&&(e.ma=4,iMf(this.Ra.ma,a,e));(c&8)>0&&(e.ma=8,iMf(this.Ya.ma,a,e))}",
				"sha": "b0d3a939634421672a727931c8ff15fee6acbc6c5d20d17bb4c2dc89d1a23084",
				"recorded": false
			},
			"staticRefs": {
				"owner": "cell",
				"source": "function(){var a=fJf(this);return a?yQf(a):null}",
				"sha": "ad16477df7a9bdc038dcb681782d89cb1205487e3fda48bb77ea12697619c443",
				"recorded": true
			},
			"dynamicEdges": {
				"owner": "cell",
				"source": "function(){var a;return(a=this.ma.Hb.Wc(this.qa,this.oa))?nTf(a):null}",
				"sha": "633aa25c58156e24c4913139b5cdebdfb6dc6c9d8deb8605e68be70ca97256e6",
				"recorded": true
			},
			"indexQuery": {
				"owner": "index",
				"source": "function(a,c,e,f,g,h){var k;(k=this.ma.get(a))&&k.pKa(a,c,e,f,g,h)}",
				"sha": "87a706158a7617d803f3f1c596828fc57936e69d42a0b76d021d9bea35fb2ab3",
				"recorded": true
			},
			"treeQuery": {
				"owner": "tree",
				"source": "function(a,c,e,f,g,h){$Ef(this,c,e,f,g,this.ma,h)}",
				"sha": "c6ad3739e8efb86ae6ec92b2f9045c731457dc30d1f672e3354f064a5f6623c1",
				"recorded": true
			},
			"supporting": {
				"owner": "relation",
				"source": "function(){return SL(this.ma)}",
				"sha": "85fb57f7369a155015bdb06a166e38806acd8d372889004c5e1fe72b3c48d796",
				"recorded": true
			},
			"supported": {
				"owner": "relation",
				"source": "function(){return SL(this.oa)}",
				"sha": "8b8e4b0700ffd5e1af116714a5e23e813562e5260ed0dbcdc74a958dfeade14f",
				"recorded": true
			},
			"leafEach": {
				"owner": "container",
				"source": "function(a){if(this.ma)for(let c=0;c<this.ma.length;c=c+1|0){let e=this.ma[c];a(e.ma,e.oa)}else jj(this.oa).forEach(a)}",
				"sha": "952cc26154b37112d1a2e2cc06ec35b8268666baf07b49e060a9ef303dac199a",
				"recorded": false
			},
			"sheetMapEach": {
				"owner": "sheetMap",
				"source": "function(a){var c=this.ma,e;for(e in c)a(e,c[e])}",
				"sha": "c9b694627d981d05aafb229bc52f224dab6136295f8fc0c1f76ef60f1989141b",
				"recorded": false
			},
			"es": {
				"owner": "global",
				"source": "function es(a,c,e,f,g){ds();return ns(a,c,e,f,g)}",
				"sha": "8985af33a468315bb8785f23c76d818748c7467ddeea35103e3331a1ab235da2",
				"recorded": false
			},
			"ns": {
				"owner": "global",
				"source": "function ns(a,c,e,f,g){P_a();var h=new N_a;Ep()&&(Qp(c==-2147483647||c>=0,\"startRow invalid  (%s)\",c),Qp(e==-2147483647||e>=0,\"startCol invalid  (%s)\",e),WRa(f==-2147483647||f>=c,\"bad row indices [%s,%s)\",c,f),WRa(g==-2147483647||g>=e,\"bad col indices [%s,%s)\",e,g));f<c&&f!=-2147483647&&nj(O_a,(oj(),pj),\"bad row indices [\"+c+\",\"+f+\")\",Jka());g<e&&g!=-2147483647&&nj(O_a,(oj(),pj),\"bad col indices [\"+e+\",\"+g+\")\",Jka());if((c|0)!=c||(f|0)!=f||(e|0)!=e||(g|0)!=g)throw Bf(dj(\"Non-integer indices: [%s, %s, %s, %s]\",\n[oh(c),oh(e),oh(f),oh(g)])).Ga;a=Sp(a,\"sheetId\");h.wa=a;h.qa=c;h.va=e;h.ma=f;h.oa=g;return h}",
				"sha": "8934fcf44c611e501780d36ee5853178b8d946808b139a4f16a99602c299e7e3",
				"recorded": false
			},
			"R0a": {
				"owner": "global",
				"source": "function R0a(a,c,e,f){if(a.oa!=null||a.Rb())return null;var g=S0a(a)?P0a(a.ma.ma,a.wa,e):-2147483647,h=T0a(a)?P0a(a.ma.qa,a.va,f):-2147483647;e=U0a(a)?P0a(a.ma.oa,a.xa,e):-2147483647;var k=a.qa!=-2147483647?P0a(a.ma.va,a.qa,f):-2147483647;f=a.ma;if(S0a(a)&&e<=g&&e!=-2147483647){f=t_a(f,0);var p=g;g=e-1|0;e=p+1|0}T0a(a)&&k<=h&&k!=-2147483647&&(f=t_a(f,1),p=h,h=k-1|0,k=p+1|0);if(g<0&&g!=-2147483647||e<=0&&e!=-2147483647||h<0&&h!=-2147483647||k<=0&&k!=-2147483647)return null;c=f.wa?a.za:c;if(c==null)return null;\nc=Tp(c);a=es(c,S0a(a)?g:-2147483647,T0a(a)?h:-2147483647,U0a(a)?e:-2147483647,a.qa!=-2147483647?k:-2147483647);g=new J0a;h=f;g.ma=a;g.oa=h;return g}",
				"sha": "4d94a2af82f09672f6b977a5b6dfc798e311d35afe18b8534f0ae744ddbbd7e3",
				"recorded": true
			},
			"p2e": {
				"owner": "global",
				"source": "function p2e(a,c,e,f){return(a=R0a(a.ma,c,e,f))?a.ma:null}",
				"sha": "06c4daf9eeb87644d93979a640d2a71ed72dc292f1953688ebd8194314b4bb76",
				"recorded": true
			},
			"t2e": {
				"owner": "global",
				"source": "function t2e(){this.oa=0}",
				"sha": "f435646363612d68b8f06db3704e4f4560ce2e12bba13a6c35b42b7d2e61d900",
				"recorded": true
			},
			"fJf": {
				"owner": "global",
				"source": "function fJf(a){return a.ma.oa.Wc(a.qa,a.oa)}",
				"sha": "3febcf147ccd7247ca0d42f17becb7e576ffecadbc24f8633db02e7b0a9aa938",
				"recorded": true
			},
			"yQf": {
				"owner": "global",
				"source": "function yQf(a){if(S8e(a.ma)&&S8e(a.oa))return a.qa?xQf(a.qa):null;var c=bk();a.qa&&LF(c,xQf(a.qa));a.ma&&a.ma.forEach(function(e,f){fk(c,f)});a.oa&&a.oa.forEach(function(e,f){fk(c,f)});return qxe(hk(c),dg())}",
				"sha": "ad9a908f55721666e331468411b742071f01c1bac09330cce17caad0baed5223",
				"recorded": true
			},
			"xQf": {
				"owner": "global",
				"source": "function xQf(a){a.va||a.va||(a.va=wQf(a));return a.va}",
				"sha": "1006d21ed04bac3b095838fe5559cb8aaff98a9ec1ac75993e3d291792e42e57",
				"recorded": true
			},
			"wQf": {
				"owner": "global",
				"source": "function wQf(a){var c=oxe(a.ma.Cb());LPf(a,new HPf(function(e,f){a.K1c(f.ma)&&fk(c,n4e(e,f))}));return qxe(hk(c),eg(function(e,f){return h2e(e,f)}))}",
				"sha": "dda63fdf66a103dee6479e0655b7f7ba6c38b1dc6c19c096e44e05c6ac0755f5",
				"recorded": true
			},
			"nTf": {
				"owner": "global",
				"source": "function nTf(a){a.qa||a.qa||(a.qa=mTf(a));return a.qa}",
				"sha": "b4c9f6713dc7158df3b4a0d7b83dac53a590f5919cd1711b653656291c7669a3",
				"recorded": true
			},
			"mTf": {
				"owner": "global",
				"source": "function mTf(a){var c=bk();LPf(a,new HPf(function(e,f){if(D2e(f)){var g=k0e(f.ma);let k=new l0e;var h=k;f=f.wa;h.ma=e;h.oa=g;h.qa=f;fk(c,k)}}));return hk(c)}",
				"sha": "daab7ea661d34f680a62fd9aef6d48ef540481585135dbbecf0219962c71ac1b",
				"recorded": true
			},
			"LPf": {
				"owner": "global",
				"source": "function LPf(a,c){a.ma.Sm(function(e){var f=e.Ew();if(!e.I1c()){var g=e.By();e=e.Kr();for(let k=0;k<f.length;k=k+1|0){var h=f[k];let p=h.oa;h=X2e(h,g,e);for(let q=0;q<p.length;q=q+1|0){let r=c.ma;r(h,p[q])}}}})}",
				"sha": "7966a69cde022f14575d390723e3882d9287e25a23255cef323a0985fa356f1f",
				"recorded": true
			},
			"q1e": {
				"owner": "global",
				"source": "function q1e(a){switch(a){case 0:return\"FROM_ARRAY_VALUE_TO_ARRAY_EXPRESSION\";case 1:return\"FROM_ARRAY_EXPR_TO_RESULT_RANGE\";case 2:return\"FROM_FORMULA_TO_GRID_STRUCTURE\";case 3:return\"FROM_CONDITIONAL_FORMAT_TO_GRID_STRUCTURE\";case 4:return\"FROM_DATA_VALIDATION_TO_GRID_STRUCTURE\";case 5:return\"FROM_FORMULA_TO_RANGE\";case 6:return\"FROM_CONDITIONAL_FORMAT_TO_RANGE\";case 7:return\"FROM_DATA_VALIDATION_TO_RANGE\";default:throw zf(\"vi`\"+N(a)).Ga;}}",
				"sha": "4a21ae53a8d93046a343e361678856d34ef5cc4c6fb38723e5ff338ecc22880c",
				"recorded": true
			},
			"pTf": {
				"owner": "global",
				"source": "function pTf(a,c,e){var f=a.Vc[0],g=new oTf;g.qa=c;g.oa=e;g.va=f;g.ma=a;return g}",
				"sha": "b0f4b7865e7b932a6705b961dac3d431064dd08a1eb3979651bd6809070b338a",
				"recorded": true
			},
			"aYf": {
				"owner": "global",
				"source": "function aYf(a,c,e){$Xf(c,e);if(Ep()){if(c>=a.qa)throw Bf(\"Zp`\"+c+\"`\"+a.qa+\"`\"+N(a.ma)).Ga;if(e>=a.va)throw Bf(\"$p`\"+e+\"`\"+a.va+\"`\"+N(a.ma)).Ga;}}",
				"sha": "7c548100c193c785bf5987528010e965cc936bb6a8c542c261642e71b883d3ed",
				"recorded": true
			},
			"$Ef": {
				"owner": "global",
				"source": "function $Ef(a,c,e,f,g,h,k){if(!h.ma)return!0;var p=h.ma;if(Yef(c,f,p.oa,p.va)&&Yef(e,g,p.ma,p.qa)){if(h.qa)return k.oa(TEf(h));h=h.oa;for(let q=0,r=h.length;q<r;q=q+1|0)if(!$Ef(a,c,e,f,g,h[q],k))return!1}return!0}",
				"sha": "cd784bf419ed0aee71ed01401760a505c55ce193d1bcb3d26303f3b72a451a8a",
				"recorded": true
			},
			"TEf": {
				"owner": "global",
				"source": "function TEf(a){return Tp(a.qa)}",
				"sha": "fa185e0569cbc86ae3efcdcd0144e4e96e539ed6fd86f4783966dbe79b6dbcde",
				"recorded": true
			},
			"Yef": {
				"owner": "global",
				"source": "function Yef(a,c,e,f){return(f==-2147483647||a==-2147483647||a<f)&&(c==-2147483647||e==-2147483647||c>e)}",
				"sha": "fc9e1b64b723199c7fde4c7925ddd4c61d90b27d7b13c46a536e57c28f51df96",
				"recorded": true
			},
			"iMf": {
				"owner": "global",
				"source": "function iMf(a,c,e){a.ma.pKa(c.Ta(),c.qa,c.va,c.ma,c.oa,WLf(e))}",
				"sha": "d9d148e0c26b1e54f4039e8af47ddd7ca91bc22706c932a23b0e0c3aa77509be",
				"recorded": false
			},
			"SL": {
				"owner": "global",
				"source": "function SL(a){return Sp(a.ma,\"This GridRangeReference is no longer part of a RangeMap, which means that row and column indices are no longer being tracked.\")}",
				"sha": "1efb73296749230dc121ba596d4b04b0294cb8f8bd488184ea4b5324187070e1",
				"recorded": false
			},
			"Qt": {
				"owner": "global",
				"source": "function Qt(a){ij(a.oa.Bj(),\"Chunk %s is not loaded\",a.ma);return a.oa}",
				"sha": "3cd291a38d7da0d85178118189ec0c7331b0cea70f77ac51fa093f2cede5f0b7",
				"recorded": false
			}
		}
	}.roles;
	var own$2 = (value, key) => Object.getOwnPropertyDescriptor(value ?? {}, key)?.value;
	var calls = {
		cell: { Qt: "@Qt(this)" },
		chunkRead: {
			aYf: "@aYf(this",
			pTf: "@pTf(this"
		},
		staticRefs: {
			fJf: "@fJf(this)",
			yQf: "@yQf(a)"
		},
		yQf: { xQf: "@xQf(a.qa)" },
		xQf: { wQf: "=@wQf(a)" },
		wQf: { LPf: "@LPf(a," },
		dynamicEdges: { nTf: "@nTf(a)" },
		nTf: { mTf: "=@mTf(a)" },
		mTf: { LPf: "@LPf(a," },
		p2e: { R0a: "@R0a(a.ma" },
		R0a: { es: "=@es(c" },
		es: { ns: "@ns(a" },
		treeQuery: { $Ef: "@$Ef(this" },
		$Ef: {
			Yef: "@Yef(c,f",
			TEf: "@TEf(h)"
		},
		supported: { SL: "@SL(this" },
		supporting: { SL: "@SL(this" }
	};
	var searched = {
		p2e: { arity: 4 },
		q1e: {
			arity: 1,
			marker: "\"FROM_FORMULA_TO_RANGE\""
		},
		LPf: { arity: 2 }
	};
	function createRelationBindings(g) {
		const globals = /* @__PURE__ */ new Map(), methods = /* @__PURE__ */ new WeakMap();
		const changed = (role) => Error(`Google изменил источник связей (${role}). Нужна проверка совместимости.`);
		function verified(role, fn) {
			const view = typeof fn === "function" ? align(roles$2[role].source, source$1(fn)) : null;
			if (!view) throw changed(role);
			return Object.assign(view, {
				fn,
				role
			});
		}
		function withCallees(view) {
			for (const [role, snippet] of Object.entries(calls[view.role] ?? {})) global(role, view.at(snippet));
			return view;
		}
		function global(role, name) {
			const cached = globals.get(role);
			if (cached) {
				if (name !== void 0 && cached.name !== name) throw changed(role);
				return cached;
			}
			if (name === void 0) throw changed(role);
			const view = Object.assign(verified(role, own$2(g, name)), { name });
			globals.set(role, view);
			return withCallees(view);
		}
		function pick(candidates, resolve, label) {
			const saved = new Map(globals), winners = [];
			for (const candidate of candidates) {
				try {
					winners.push({
						view: resolve(candidate),
						cache: new Map(globals)
					});
				} catch {}
				globals.clear();
				for (const [key, value] of saved) globals.set(key, value);
			}
			if (winners.length !== 1) throw Error(`${label} не найден однозначно.`);
			for (const [key, value] of winners[0].cache) globals.set(key, value);
			return winners[0].view;
		}
		function search(role) {
			if (globals.has(role)) return globals.get(role);
			const { arity, marker } = searched[role], length = roles$2[role].source.length, names = [];
			for (const name of Object.getOwnPropertyNames(g)) {
				const fn = own$2(g, name);
				if (typeof fn !== "function" || fn.length !== arity) continue;
				const text = source$1(fn);
				if (text.length > length / 2 && text.length < length * 2 && (!marker || text.includes(marker)) && align(roles$2[role].source, text)) names.push(name);
			}
			return pick(names, (name) => global(role, name), `Функция связей (${role})`);
		}
		function candidates(object, role) {
			const found = /* @__PURE__ */ new Map();
			for (let level = object && Object.getPrototypeOf(object); level && level !== Object.prototype; level = Object.getPrototypeOf(level)) for (const name of Object.getOwnPropertyNames(level)) {
				const fn = own$2(level, name);
				if (name !== "constructor" && !found.has(name) && typeof fn === "function" && align(roles$2[role].source, source$1(fn))) found.set(name, Object.assign(verified(role, fn), { name }));
			}
			return [...found.values()];
		}
		function cached(object, key, resolve) {
			const prototype = object && Object.getPrototypeOf(object);
			if (!prototype) throw Error(`Объект связей недоступен (${key}).`);
			if (!methods.has(prototype)) methods.set(prototype, /* @__PURE__ */ new Map());
			const cache = methods.get(prototype);
			if (!cache.has(key)) cache.set(key, resolve());
			return cache.get(key);
		}
		function method(object, role) {
			return cached(object, role, () => pick(candidates(object, role), withCallees, `Метод связей (${role})`));
		}
		function named(object, name, role) {
			return cached(object, `${role}:${name}`, () => withCallees(Object.assign(verified(role, object?.[name]), { name })));
		}
		function fieldHolding(object, role) {
			const keys = Object.keys(object ?? {}).filter((key) => {
				const value = own$2(object, key);
				try {
					return !!value && typeof value === "object" && !!method(value, role);
				} catch {
					return false;
				}
			});
			if (keys.length !== 1) throw Error(`Поле связей (${role}) не найдено однозначно.`);
			return keys[0];
		}
		function rangeFields() {
			search("p2e");
			const ns = global("ns");
			return {
				sheetId: ns.at("h.@wa=a"),
				rowStart: ns.at("h.@qa=c"),
				colStart: ns.at("h.@va=e"),
				rowEnd: ns.at("h.@ma=f"),
				colEnd: ns.at("h.@oa=g")
			};
		}
		function indexTree(index, query, sheetId) {
			const holder = own$2(index, query.at("this.@ma.get(a)"));
			const sheetMap = own$2(holder, method(holder, "sheetMapEach").at("var c=this.@ma"));
			if (!sheetMap || Object.getPrototypeOf(sheetMap) !== null) throw Error("Обратный индекс недоступен.");
			const tree = own$2(sheetMap, sheetId);
			if (!tree) return null;
			const treeQuery = named(tree, query.at("k.@pKa(a,c"), "treeQuery"), walk = global("$Ef");
			return {
				root: own$2(tree, treeQuery.at(",this.@ma,h)")),
				node: {
					rect: walk.at("var p=h.@ma"),
					leaf: walk.at("if(h.@qa)"),
					children: walk.at("h=h.@oa;")
				},
				rect: {
					rowStart: walk.at("p.@oa,p.va"),
					rowEnd: walk.at("p.oa,p.@va"),
					colStart: walk.at("e,g,p.@ma"),
					colEnd: walk.at("p.ma,p.@qa")
				}
			};
		}
		function leafPairs(leaf) {
			const container = own$2(leaf, fieldHolding(leaf, "leafEach"));
			const each = method(container, "leafEach");
			const pairs = own$2(container, each.at("if(this.@ma)"));
			return Array.isArray(pairs) ? {
				pairs,
				key: each.at("a(e.@ma,e.oa)"),
				relation: each.at("a(e.ma,e.@oa)")
			} : null;
		}
		function relationRefs(relation) {
			const lpf = search("LPf");
			const supporting = named(relation, lpf.at("var g=e.@By()"), "supporting");
			return {
				supported: named(relation, lpf.at("e=e.@Kr()"), "supported").at("SL(this.@oa)"),
				supporting: supporting.at("SL(this.@ma)"),
				range: global("SL").at("Sp(a.@ma")
			};
		}
		function direction(tree) {
			let node = tree.root;
			for (let depth = 0; node && !own$2(node, tree.node.leaf) && depth < 64; depth++) node = own$2(node, tree.node.children)?.[0];
			const found = node && leafPairs(own$2(node, tree.node.leaf));
			const pair = found?.pairs[0], relation = own$2(pair, found?.relation);
			if (!relation) return null;
			const refs = relationRefs(relation), key = own$2(pair, found.key);
			return key === own$2(relation, refs.supported) ? "primary" : key === own$2(relation, refs.supporting) ? "secondary" : null;
		}
		return {
			cellReader(grid) {
				const cell = method(grid, "cell"), qt = global("Qt");
				const chunk = own$2(grid, qt.at("a.@oa.Bj()")), ready = qt.at("a.oa.@Bj()");
				if (!chunk || typeof chunk[ready] !== "function" || !chunk[ready]()) return null;
				method(chunk, "chunkRead");
				const bounds = global("aYf");
				return {
					chunk,
					cellMethod: cell.name,
					rows: own$2(chunk, bounds.at("c>=a.@qa")),
					columns: own$2(chunk, bounds.at("e>=a.@va"))
				};
			},
			forward(cell) {
				const staticRefs = method(cell, "staticRefs"), dynamicEdges = method(cell, "dynamicEdges");
				const p2e = search("p2e"), r0a = global("R0a"), q1e = search("q1e"), edge = global("mTf");
				return {
					staticRefs: () => cell[staticRefs.name](),
					dynamicEdges: () => cell[dynamicEdges.name](),
					isStaticRef: (ref) => !!ref?.constructor && !!align(roles$2.t2e.source, source$1(ref.constructor)),
					staticRange: (ref, sheetId, row, col) => p2e.fn(ref, sheetId, row, col),
					dynamicRange: (relative, sheetId, row, col) => own$2(r0a.fn(relative, sheetId, row, col), r0a.at("g.@ma=a")),
					edgeType: (value) => own$2(value, edge.at("h.@oa=g")),
					edgeRelative: (value) => own$2(value, edge.at("h.@ma=e")),
					typeName: (type) => q1e.fn(type),
					range: rangeFields(),
					members: {
						staticRefs: staticRefs.name,
						dynamicEdges: dynamicEdges.name
					}
				};
			},
			reverse(chunk, sheetId) {
				const trees = [];
				for (const query of candidates(chunk, "chunkQuery")) {
					const iMf = verified("iMf", own$2(g, query.at("@iMf(this.Ea")));
					const index = own$2(own$2(own$2(chunk, query.at("this.@Ea.ma")), query.at("this.Ea.@ma")), iMf.at("a.@ma.pKa"));
					const tree = index && indexTree(index, named(index, iMf.at("a.ma.@pKa"), "indexQuery"), sheetId);
					if (tree) trees.push(tree);
				}
				if (!trees.length) return null;
				const primary = trees.filter((tree) => direction(tree) === "primary");
				if (primary.length !== 1) throw Error("Направление обратного индекса не подтверждено.");
				return {
					...primary[0],
					range: rangeFields(),
					pairs: leafPairs,
					supportedRange(relation) {
						const refs = relationRefs(relation);
						return own$2(own$2(relation, refs.supported), refs.range);
					}
				};
			}
		};
	}
	//#endregion
	//#region userscript/src/relations.js
	var own$1 = (value, key) => Object.getOwnPropertyDescriptor(value ?? {}, key)?.value;
	var sentinel = -2147483647;
	var letters = (index) => {
		let text = "";
		for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text;
		return text;
	};
	function readSelection(g = globalThis) {
		const box = g.document.getElementById("t-name-box");
		const input = box?.matches("input") ? box : box?.querySelector("input");
		const address = (input?.value ?? box?.textContent ?? "").trim();
		const url = new URL(g.location.href);
		const hash = new URLSearchParams(url.hash.slice(1));
		const sheetId = hash.get("gid") ?? url.searchParams.get("gid");
		const match = /^([A-Z]+)([1-9]\d*)$/.exec(address);
		const invalid = (reason) => ({
			key: `invalid:${sheetId}:${address}:${reason}`,
			status: "unavailable",
			reason
		});
		if (g.document.hidden) return invalid("Вкладка браузера скрыта.");
		if (url.origin !== "https://docs.google.com" || !/^\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]+\/edit\/?$/.test(url.pathname)) return invalid("Откройте Google Таблицу.");
		if (hash.has("fvid") || url.searchParams.has("fvid")) return invalid("Связи в режиме фильтра пока недоступны.");
		if (!match || g.document.activeElement === input || g.document.activeElement === box) return invalid("Выберите одну ячейку в таблице.");
		if (!sheetId || !/^\d+$/.test(sheetId)) return invalid("Не удалось определить выбранный лист.");
		const row = Number(match[2]) - 1;
		const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
		if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col)) return invalid("Адрес ячейки недоступен.");
		return {
			key: `${url.pathname}:${sheetId}:${address}`,
			status: "selected",
			sheetId,
			row,
			col,
			address
		};
	}
	function describeRange(range, fields, type = "formula-range") {
		const sheetId = own$1(range, fields.sheetId);
		const [rs, cs, re, ce] = [
			fields.rowStart,
			fields.colStart,
			fields.rowEnd,
			fields.colEnd
		].map((key) => own$1(range, key));
		if (typeof sheetId !== "string" || ![
			rs,
			cs,
			re,
			ce
		].every(Number.isSafeInteger)) return null;
		if ([
			rs,
			cs,
			re,
			ce
		].some((n) => n < 0 && n !== sentinel)) return null;
		if (rs !== sentinel && re !== sentinel && re <= rs || cs !== sentinel && ce !== sentinel && ce <= cs) return null;
		let address;
		if (cs !== sentinel && ce !== sentinel && rs === sentinel && re === sentinel) address = `${letters(cs)}:${letters(ce - 1)}`;
		else if (rs !== sentinel && re !== sentinel && cs === sentinel && ce === sentinel) address = `${rs + 1}:${re}`;
		else if (![
			rs,
			cs,
			re,
			ce
		].includes(sentinel)) {
			const first = letters(cs) + (rs + 1), last = letters(ce - 1) + re;
			address = first === last ? first : `${first}:${last}`;
		} else address = "Открытый диапазон";
		return {
			key: `${type}:${sheetId}:${rs}:${cs}:${re}:${ce}`,
			type,
			sheetId,
			address
		};
	}
	function reverseCandidates(index, selection, { maxNodes = 2e3, maxRecords = 200 } = {}) {
		if (!index?.root || typeof index.root !== "object") return {
			available: false,
			entries: [],
			reason: "Дерево обратных связей недоступно."
		};
		const stack = [index.root], entries = /* @__PURE__ */ new Map(), { node: fields, rect: bounds } = index;
		let nodes = 0, records = 0, partial = false;
		const intersects = (a, b, c, d) => (d === sentinel || a < d) && (c === sentinel || b > c);
		while (stack.length) {
			if (++nodes > maxNodes || records >= maxRecords) {
				partial = true;
				break;
			}
			const node = stack.pop(), rect = own$1(node, fields.rect);
			if (!rect) continue;
			const [rs, cs, re, ce] = [
				bounds.rowStart,
				bounds.colStart,
				bounds.rowEnd,
				bounds.colEnd
			].map((key) => own$1(rect, key));
			if (![
				rs,
				cs,
				re,
				ce
			].every(Number.isInteger)) {
				partial = true;
				continue;
			}
			if (!intersects(selection.row, selection.row + 1, rs, re) || !intersects(selection.col, selection.col + 1, cs, ce)) continue;
			const leaf = own$1(node, fields.leaf);
			if (leaf) {
				let found = null;
				try {
					found = index.pairs(leaf);
				} catch {}
				if (!found) {
					partial = true;
					continue;
				}
				for (let i = 0; i < found.pairs.length; i++) {
					if (++records > maxRecords) {
						partial = true;
						break;
					}
					let range = null;
					try {
						range = describeRange(index.supportedRange(own$1(found.pairs[i], found.relation)), index.range, "candidate");
					} catch {}
					if (range) entries.set(range.key, range);
					else partial = true;
				}
			} else {
				const children = own$1(node, fields.children);
				if (!Array.isArray(children)) {
					partial = true;
					continue;
				}
				const capacity = Math.max(0, maxNodes - nodes - stack.length);
				if (children.length > capacity) partial = true;
				for (let i = Math.min(children.length, capacity) - 1; i >= 0; i--) stack.push(children[i]);
			}
		}
		return {
			entries: [...entries.values()],
			partial,
			available: true
		};
	}
	function createRelationReader(g, gridOf) {
		const bindings = createRelationBindings(g);
		return async (selection) => {
			const report = {
				status: "unavailable",
				selection,
				static: null,
				dynamic: null,
				reverse: null,
				partial: false
			};
			try {
				const grid = await gridOf(selection.sheetId);
				const reader = grid && bindings.cellReader(grid);
				if (!reader) throw Error("Данные листа ещё не загружены.");
				if (!Number.isInteger(reader.rows) || !Number.isInteger(reader.columns) || selection.row >= reader.rows || selection.col >= reader.columns) throw Error("Ячейка вне загруженного листа.");
				const cell = grid[reader.cellMethod](selection.row, selection.col);
				const forward = bindings.forward(cell);
				if (readSelection(g).key !== selection.key) return {
					...report,
					status: "stale"
				};
				const refs = forward.staticRefs(), edges = forward.dynamicEdges();
				const decode = (items, convert) => {
					if (items === null) return null;
					if (!Array.isArray(items)) {
						report.partial = true;
						return null;
					}
					if (items.length > 500) report.partial = true;
					const unique = /* @__PURE__ */ new Map();
					for (const item of items.slice(0, 500)) {
						const result = convert(item);
						if (result) unique.set(result.key, result);
						else report.partial = true;
					}
					return [...unique.values()];
				};
				const { sheetId, row, col } = selection;
				report.static = decode(refs, (ref) => forward.isStaticRef(ref) ? describeRange(forward.staticRange(ref, sheetId, row, col), forward.range) : null);
				report.dynamic = decode(edges, (edge) => {
					const type = forward.edgeType(edge), relative = forward.edgeRelative(edge);
					return Number.isInteger(type) && type >= 0 && type <= 7 && relative ? describeRange(forward.dynamicRange(relative, sheetId, row, col), forward.range, forward.typeName(type)) : null;
				});
				try {
					const index = bindings.reverse(reader.chunk, sheetId);
					if (!index) throw Error("Нет обратного индекса этого листа.");
					if (readSelection(g).key !== selection.key) return {
						...report,
						status: "stale"
					};
					report.reverse = reverseCandidates(index, selection);
				} catch (error) {
					report.reverse = {
						available: false,
						entries: [],
						reason: error.message
					};
				}
				report.status = "read";
				report.updatedAt = Date.now();
			} catch (error) {
				report.reason = error.message;
			}
			return report;
		};
	}
	function watchRelations({ selection, read, publish, active = () => true, interval = 200, refreshMs = 2e3 }) {
		let stopped = false, current = null, generation = 0, busy = false, last = 0;
		async function tick() {
			if (stopped) return;
			if (!active()) {
				current = null;
				generation++;
				return;
			}
			const next = selection();
			if (next.key !== current?.key) {
				current = next;
				generation++;
				last = 0;
				publish(next.status === "selected" ? {
					status: "loading",
					selection: next
				} : next);
			}
			if (busy || next.status !== "selected" || last && Date.now() - last < refreshMs) return;
			busy = true;
			const revision = generation;
			try {
				const result = await read(next);
				if (!stopped && active() && revision === generation && selection().key === next.key && result.status !== "stale") {
					publish(result);
					last = Date.now();
				}
			} catch (error) {
				if (!stopped && active() && revision === generation && selection().key === next.key) {
					publish({
						status: "unavailable",
						selection: next,
						reason: error.message
					});
					last = Date.now();
				}
			} finally {
				busy = false;
			}
		}
		const timer = setInterval(tick, interval);
		tick();
		return () => {
			stopped = true;
			generation++;
			clearInterval(timer);
		};
	}
	//#endregion
	//#region userscript/src/native/experimental-bindings.js
	var roles = {
		build: "ggV6s0daVJw",
		provenance: "research/archive/native-build-ggV6-2026-09-22/live-symbols.json (Fwd) and performancetool.js (Mcz); both SHA equal live-verified fingerprints",
		roles: {
			"latencyLogger": {
				"owner": "global",
				"source": "function Fwd(a){gn.call(this);a=a||\"docs_latencyStats\";this.ma={};na(a,this.ma)}",
				"sha": "c41f190df266bbb521ca6946262b466b228246fe87c67b23264fdc69e3671f62"
			},
			"analysis": {
				"owner": "panel",
				"source": "function Mcz(a,c,e,f,g,h,k,p,q,r){fy.call(this,r);this.Ra=g;this.va=a;this.Ia=new vKi(c,a);this.Aa=e;this.Ca=f;this.ma=new Ecz(g,121,r);this.gb(this.ma);this.Wa=new Map;this.oa=new Jcz(!0,r);this.gb(this.oa);this.qa=new Jcz(!0,r);this.gb(this.qa);this.wa=this.za=null;this.Ib=h;this.xa=0;this.Da=k;this.Ea=p;this.Ba=q}",
				"sha": "57f03f7d365a8bcf7ec9d71c2056edb1ca8690c67adc2e0b9f2bbcef9c8cc9d7"
			}
		}
	}.roles;
	var own = (value, key) => Object.getOwnPropertyDescriptor(value ?? {}, key)?.value;
	function createExperimentalBindings(g) {
		let logger;
		return {
			latencyLogger() {
				if (logger === void 0) logger = Object.getOwnPropertyNames(g).filter((name) => {
					const fn = own(g, name);
					return typeof fn === "function" && fn.length === 1 && source$1(fn).includes("\"docs_latencyStats\"") && !!align(roles.latencyLogger.source, source$1(fn));
				}).length === 1;
				return logger;
			},
			modelSize(feature) {
				const seen = /* @__PURE__ */ new Set(), found = [];
				const visit = (value, depth) => {
					if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value) || depth > 3 || seen.size > 500) return;
					seen.add(value);
					const view = value.constructor && align(roles.analysis.source, source$1(value.constructor));
					if (view) found.push({
						value,
						bytes: view.at("this.@xa=0")
					});
					for (const key of Object.keys(value)) visit(own(value, key), depth + 1);
				};
				visit(feature, 0);
				if (found.length !== 1) return null;
				return { bytes: own(found[0].value, found[0].bytes) };
			}
		};
	}
	//#endregion
	//#region userscript/src/adapter.js
	function createAdapter(timing) {
		const g = globalThis, native = createNativeBindings(g);
		const verify = native.verify;
		const call = native.call;
		const method = native.method;
		let request = null, requestTimeout;
		const launch = createLaunchGuard();
		const tools = createExperimentalBindings(g);
		const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		async function verifyModel(model) {
			const roles = [
				"wm",
				"oO",
				"Vod"
			].filter((role) => native.build.fingerprints[role]);
			await verify(roles, Object.fromEntries(roles.map((role) => [role, model[native.member(role)]])));
		}
		const readRelations = createRelationReader(g, async (sheetId) => {
			await native.select();
			const model = call("dx");
			await verifyModel(model);
			return method(model, "wm")[native.build.fields.bookGrid ?? "Ad"](sheetId);
		});
		function app() {
			if (location.origin !== "https://docs.google.com" || !/^\/spreadsheets\/(?:u\/\d+\/)?d\/[\w-]+\/edit\/?$/.test(location.pathname)) throw Error("Откройте Google-таблицу.");
			if (!document.getElementById("t-name-box") || typeof g.waffle_api?.getInstanceOfApp !== "function") throw Error("Дождитесь загрузки таблицы.");
			return g.waffle_api.getInstanceOfApp();
		}
		function currentView() {
			const shell = app()[native.build?.appShell ?? "Ea"];
			const registration = native.build?.registration;
			return (registration ? shell?.[registration.hostField]?.[registration.registryField] : native.build?.sheetList === "native-book" ? shell?.qa?.ea : shell?.wa?.ma)?.get("performancetool")?.getFeature?.() ?? null;
		}
		async function open() {
			await native.select();
			const a = app()[native.build.appShell ?? "Ea"];
			await verify([
				"QC",
				"Usd",
				"wtc"
			]);
			if (native.build.registration) {
				const registration = native.build.registration;
				const host = a?.[registration.hostField];
				if (!host?.[registration.registryField]?.has("performancetool")) call("QC", host, Reflect.construct(native.symbol("Usd"), registration.args.map((expression) => resolveRegistrationArg(a, expression))));
			} else if (native.build.sheetList === "native-book") {
				if (!a?.qa?.ea?.has("performancetool")) call("QC", a.qa, Reflect.construct(native.symbol("Usd"), [
					a.Aa,
					a.va,
					a.wa,
					a.ea.Sb(),
					a.ea.uC,
					a.oa,
					a.Ib,
					a.ea.ea.ea.hf(),
					a.Pa,
					a.ma,
					a.ea.ea.xa
				]));
			} else if (!a.wa.ma.has("performancetool")) call("QC", a.wa, Reflect.construct(native.symbol("Usd"), [
				a.Ba,
				a.va,
				a.xa,
				a.ma.Tb(),
				a.ma[native.build.fields.openContext],
				a.qa,
				a.Ib,
				a.ma.ma.ma[native.build.fields.openService](),
				a.Ra,
				a.oa,
				a.ma.ma.za
			]));
			call("wtc");
			for (let n = 0; n < 100; n++) {
				if (currentView() && (document.querySelector(".waffle-performancetool-calculations-body") || document.querySelector(".waffle-performancetool-landingpage-next-button"))) return { opened: true };
				await wait(100);
			}
			throw Error("Панель ещё загружается. Повторите открытие через несколько секунд.");
		}
		async function capacity(model) {
			let count = null, limit = null;
			try {
				if (native.build.fingerprints.Rl) try {
					await verify(["Rl"]);
					const shell = app()[native.build.appShell ?? "Ea"];
					const config = native.build.sheetList === "native-book" ? shell?.ma : shell?.oa;
					const value = call("Rl", config, "fmtcx2");
					if (Number.isSafeInteger(value) && value > 0) limit = value;
				} catch {}
				if (native.build.capacity) {
					const grids = method(model, "wm")[native.build.fields.bookList ?? "xU"]();
					if (!Array.isArray(grids)) throw Error("Список листов недоступен.");
					let total = 0;
					for (const grid of grids) {
						const storage = grid?.[native.build.capacity.grid];
						const rows = storage?.[native.build.capacity.rows], columns = storage?.[native.build.capacity.columns];
						const cells = rows * columns;
						if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 0 || columns < 0 || !Number.isSafeInteger(cells) || !Number.isSafeInteger(total + cells)) throw Error("Размеры листов изменились или недоступны.");
						total += cells;
					}
					if (limit !== null && total > limit) throw Error("Размер книги превышает известный лимит; счётчик требует проверки.");
					return {
						count: total,
						limit,
						source: `derived:${native.build.id}:native-grid-dimensions`
					};
				}
				if (typeof native.symbol("I2i") !== "function") throw Error("Счётчик ячеек недоступен.");
				if (native.build.fingerprints.I2i) await verify(["I2i"]);
				const used = call("I2i", method(model, "wm"))[native.build.fields.count]();
				if (Number.isSafeInteger(used) && used >= 0) count = used;
				return {
					count,
					limit,
					source: `native:${native.build.id}:cell-count/fmtcx2`
				};
			} catch (error) {
				return {
					count,
					limit,
					unavailableReason: error.message
				};
			}
		}
		function progress() {
			return !!document.getElementById("t-formula-bar-progress-bar")?.getClientRects().length;
		}
		function updateRequest(data, busy) {
			if (data.error && request?.state === "waiting") request = {
				...request,
				state: "queued-without-measurements",
				measurementWarning: data.error
			};
			request = observeRequest(request, data.updatedAt, busy, Date.now(), data.sequence);
			if (request?.state !== "waiting") clearTimeout(requestTimeout);
		}
		function sheets() {
			if (native.build.sheetList === "native-book") {
				const model = call("dx");
				const sheetIdField = native.build.fields.sheetId;
				const [nameField, nameValue] = native.build.fields.sheetNamePath ?? ["Bk", "ea"];
				const list = method(model, "wm")[native.build.fields.bookList ?? "xU"]();
				if (!Array.isArray(list)) throw Error("Список листов этой сборки недоступен.");
				return list.slice(0, 2e3).filter((grid) => grid && typeof grid[sheetIdField] === "string" && method(model, "oO", grid[sheetIdField]) && method(model, "Vod", grid[sheetIdField]) === 0).map((grid) => {
					const name = grid[nameField]?.[nameValue];
					return {
						id: grid[sheetIdField],
						name: typeof name === "string" ? name.slice(0, 250) : grid[sheetIdField]
					};
				});
			}
			const tabs = app().va.Tb();
			return Object.keys(tabs.oa).slice(0, 2e3).map((id) => {
				const tab = call("AA", tabs, id);
				return {
					id,
					name: String(tab[native.build.fields.sheetName]()).slice(0, 250)
				};
			}).filter(({ id }) => method(call("dx"), "oO", id) && method(call("dx"), "Vod", id) === 0);
		}
		function formulaAt(model, item) {
			if (item.type !== 1) return {
				status: "not-formula-phase",
				formula: null
			};
			if (!cellAddress(item.row, item.col) || !item.sheetId) return {
				status: "unknown-address",
				formula: null
			};
			try {
				const grid = method(model, "wm")[native.build.fields.bookGrid ?? "Ad"](item.sheetId);
				const storage = grid?.[native.build.fields.storage ?? "oa"];
				if (!grid || !storage?.[native.build.fields.storageReady]?.()) return {
					status: "not-loaded",
					formula: null
				};
				const cell = grid[native.build.fields.cell ?? "Er"](item.row, item.col);
				if (!cell || !method(model, "Oqb", cell)) return {
					status: "no-formula-at-address",
					formula: null
				};
				const formula = method(model, "NNc", cell, item.sheetId, item.row, item.col);
				return typeof formula === "string" && formula.length <= 5e4 ? {
					status: "read",
					formula
				} : {
					status: "too-long",
					formula: null
				};
			} catch {
				return {
					status: "not-loaded",
					formula: null
				};
			}
		}
		async function measurements() {
			try {
				await verify(["T5h", "Abg"]);
				const host = timing.status().workerHost;
				if (host && native.build.workerHost && host !== native.build.workerHost) throw Error("Версии страницы и Worker различаются. Нужна проверка совместимости.");
				return timing.results();
			} catch (error) {
				return {
					available: false,
					updatedAt: null,
					sequence: 0,
					phases: [],
					observations: [],
					breakdown: nativeBreakdown(null),
					error: error.message,
					session: {
						observations: [],
						breakdown: nativeBreakdown(null),
						topObservedSince: null,
						truncated: false
					}
				};
			}
		}
		function readExperimentalTools() {
			const result = {
				latency: {
					entries: [],
					reason: null
				},
				modelSize: {
					bytes: null,
					reason: null
				}
			};
			try {
				result.latency = tools.latencyLogger() ? readLatencyStats(g) : {
					entries: [],
					reason: "Источник журнала не прошёл проверку совместимости"
				};
			} catch {
				result.latency.reason = "Источник журнала не прошёл проверку совместимости";
			}
			try {
				const feature = currentView();
				const size = feature && tools.modelSize(feature);
				const bytes = size?.bytes;
				result.modelSize = !feature ? {
					bytes: null,
					reason: "Нет данных штатной панели"
				} : !size ? {
					bytes: null,
					reason: "Источник размера не прошёл проверку совместимости"
				} : Number.isSafeInteger(bytes) && bytes > 0 ? {
					bytes,
					source: "native-panel-cache",
					updatedAt: null,
					reason: null
				} : {
					bytes: null,
					reason: "Google ещё не предоставил размер"
				};
			} catch {
				result.modelSize.reason = "Источник размера не прошёл проверку совместимости";
			}
			return result;
		}
		async function read({ experimental = false } = {}) {
			app();
			await native.select();
			await verify(native.build.sheetList === "native-book" ? ["dx"] : ["dx", "AA"]);
			const model = call("dx");
			await verifyModel(model);
			let formulaError = null;
			try {
				await verify(["NNc", "Oqb"], {
					NNc: model[native.member("NNc")],
					Oqb: model[native.member("Oqb")]
				});
			} catch (error) {
				formulaError = error.message;
			}
			const data = await measurements(), list = sheets(), names = new Map(list.map((s) => [s.id, s.name]));
			const busy = progress();
			updateRequest(data, busy);
			const cache = /* @__PURE__ */ new Map();
			function decorate(item) {
				const key = JSON.stringify([
					item.sheetId,
					item.row,
					item.col,
					item.type
				]);
				if (!cache.has(key)) cache.set(key, formulaError ? {
					status: "unavailable",
					formula: null
				} : formulaAt(model, item));
				return {
					...item,
					sheetName: names.get(item.sheetId) ?? null,
					...cache.get(key)
				};
			}
			const observations = data.observations.map(decorate);
			const session = data.session;
			const setup = timing.status();
			return {
				version: "0.3.18",
				nativeBuild: native.build.id,
				bookPath: location.pathname,
				capturedAt: Date.now(),
				activeSheetId: native.build.sheetList === "native-book" ? new URLSearchParams(location.hash.slice(1)).get("gid") ?? new URL(location.href).searchParams.get("gid") : app().va.Tb().va?.[native.build.fields.sheetId]?.() ?? new URLSearchParams(location.hash.slice(1)).get("gid"),
				sheets: list,
				timers: observations.length ? "observed" : setup.status,
				timingError: setup.error ?? null,
				timingSetup: setup,
				progressVisible: busy,
				request,
				...data,
				experimental: data.experimental ?? null,
				experimentalTools: experimental ? readExperimentalTools() : null,
				measurementError: data.error ?? formulaError,
				observations,
				cellCapacity: await capacity(model),
				session: {
					...session,
					observations: session.observations.map(decorate),
					note: "Сумма фаз и максимумы ячеек с раннего подключения к Worker. Пропущенные результаты не восстанавливаются."
				},
				source: "Google Sheets Worker command 1 / field 6; receivedAt is local Date.now",
				limits: {
					topPerPhase: 10,
					perCellHeap: false,
					individualFunctionTime: false,
					exclusiveSheetCalculation: false,
					sidebarMeaningfulResultFilter: false,
					loadingTime: "unavailable: main-side aggregate is not included"
				}
			};
		}
		async function refresh() {
			return read();
		}
		async function recalculate({ sheetId = null } = {}) {
			return launch(async () => {
				app();
				await native.select();
				await verify(native.build.sheetList === "native-book" ? ["dx"] : ["dx", "AA"]);
				const model = call("dx");
				await verifyModel(model);
				const data = await measurements(), busy = progress();
				const canObserve = timing.ready() && !data.error;
				updateRequest(data, busy);
				if (request?.state === "waiting" || busy) throw Error("Дождитесь текущего расчёта Sheets.");
				await verify(["t4e"], { t4e: model[native.member("t4e")] });
				if (sheetId !== null) {
					if (typeof sheetId !== "string" || !sheets().some((s) => s.id === sheetId)) throw Error("Выберите существующий лист.");
					await verify([
						"ns",
						"Woh",
						"Fj",
						"oP",
						"DP",
						"pP",
						"qP",
						"jmg"
					]);
					if (!native.symbol("tmg")) throw Error("Очередь расчёта этой версии недоступна.");
					if (!method(model, "oO", sheetId) || method(model, "Vod", sheetId) !== 0 || !method(model, "wm")[native.build.fields.bookGrid ?? "Ad"](sheetId)) throw Error("Лист этого типа не поддерживается.");
				}
				if (progress()) throw Error("Дождитесь текущего расчёта Sheets.");
				request = {
					id: crypto.randomUUID(),
					startedAt: Date.now(),
					baseline: timing.results().sequence,
					baselineKind: "sequence",
					sheetId,
					scope: sheetId ? "sheet-and-dependencies" : "workbook",
					state: canObserve ? "waiting" : "queued-without-measurements",
					measurementWarning: canObserve ? null : data.error ?? timingReason(timing.status())
				};
				clearTimeout(requestTimeout);
				if (canObserve) requestTimeout = setTimeout(() => {
					if (request?.state === "waiting") request = {
						...request,
						state: "timeout"
					};
				}, 12e4);
				try {
					if (sheetId === null) method(model, "t4e");
					else {
						const ranges = [call("ns", sheetId)];
						call("Woh", model[native.build.fields.modelStore ?? "ma"], call("Fj", call("oP", call("DP", call("pP", call("qP"), 0), ranges)), call("oP", call("DP", call("pP", call("qP"), 2), ranges)), call("oP", call("DP", call("pP", call("qP"), 1), ranges))));
						call("jmg", model[native.build.fields.modelQueue ?? "qa"], native.symbol("tmg"), null, 18);
					}
				} catch (error) {
					clearTimeout(requestTimeout);
					request = {
						...request,
						state: "error"
					};
					throw error;
				}
				return { ...request };
			});
		}
		return Object.freeze({
			version: "0.3.18",
			open,
			read,
			refresh,
			recalculate,
			readSelection: () => readSelection(g),
			readRelations,
			getRequest: () => request ? { ...request } : null,
			dispose() {
				clearTimeout(requestTimeout);
				timing.stop();
			}
		});
	}
	//#endregion
	//#region node_modules/svelte/src/internal/shared/utils.js
	var is_array = Array.isArray;
	var index_of = Array.prototype.indexOf;
	var includes = Array.prototype.includes;
	var array_from = Array.from;
	var define_property = Object.defineProperty;
	var get_descriptor = Object.getOwnPropertyDescriptor;
	var get_descriptors = Object.getOwnPropertyDescriptors;
	var object_prototype = Object.prototype;
	var array_prototype = Array.prototype;
	var get_prototype_of = Object.getPrototypeOf;
	var is_extensible = Object.isExtensible;
	/**
	* @param {any} thing
	* @returns {thing is Function}
	*/
	function is_function(thing) {
		return typeof thing === "function";
	}
	var noop$1 = () => {};
	/** @param {Array<() => void>} arr */
	function run_all(arr) {
		for (var i = 0; i < arr.length; i++) arr[i]();
	}
	/**
	* TODO replace with Promise.withResolvers once supported widely enough
	* @template [T=void]
	*/
	function deferred() {
		/** @type {(value: T) => void} */
		var resolve;
		/** @type {(reason: any) => void} */
		var reject;
		return {
			promise: new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			}),
			resolve,
			reject
		};
	}
	/**
	* @template V
	* @param {V} value
	* @param {V | (() => V)} fallback
	* @param {boolean} [lazy]
	* @returns {V}
	*/
	function fallback(value, fallback, lazy = false) {
		return value === void 0 ? lazy ? fallback() : fallback : value;
	}
	/**
	* When encountering a situation like `let [a, b, c] = $derived(blah())`,
	* we need to stash an intermediate value that `a`, `b`, and `c` derive
	* from, in case it's an iterable
	* @template T
	* @param {ArrayLike<T> | Iterable<T>} value
	* @param {number} [n]
	* @returns {Array<T>}
	*/
	function to_array(value, n) {
		if (Array.isArray(value)) return value;
		if (n === void 0 || !(Symbol.iterator in value)) return Array.from(value);
		/** @type {T[]} */
		const array = [];
		for (const element of value) {
			array.push(element);
			if (array.length === n) break;
		}
		return array;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/constants.js
	/**
	* An effect that does not destroy its child effects when it reruns.
	* Runs as part of render effects, i.e. not eagerly as part of tree traversal or effect flushing.
	*/
	var MANAGED_EFFECT = 1 << 24;
	var CLEAN = 1024;
	var DIRTY = 2048;
	var MAYBE_DIRTY = 4096;
	var INERT = 8192;
	var DESTROYED = 16384;
	/** Set once a reaction has run for the first time */
	var REACTION_RAN = 32768;
	/** Effect is in the process of getting destroyed. Can be observed in child teardown functions */
	var DESTROYING = 1 << 25;
	/**
	* 'Transparent' effects do not create a transition boundary.
	* This is on a block effect 99% of the time but may also be on a branch effect if its parent block effect was pruned
	*/
	var EFFECT_TRANSPARENT = 65536;
	var EFFECT_PRESERVED = 1 << 19;
	var USER_EFFECT = 1 << 20;
	var EFFECT_OFFSCREEN = 1 << 25;
	var REACTION_IS_UPDATING = 1 << 21;
	var ASYNC = 1 << 22;
	var ERROR_VALUE = 1 << 23;
	var STATE_SYMBOL = Symbol("$state");
	/** Marks component export objects, so that `proxy(...)` leaves them untouched */
	var COMPONENT_SYMBOL = Symbol("component");
	var LEGACY_PROPS = Symbol("legacy props");
	var LOADING_ATTR_SYMBOL = Symbol("");
	var ATTRIBUTES_CACHE = Symbol("attributes");
	var CLASS_CACHE = Symbol("class");
	var STYLE_CACHE = Symbol("style");
	var TEXT_CACHE = Symbol("text");
	var FORM_RESET_HANDLER = Symbol("form reset");
	/** allow users to ignore aborted signal errors if `reason.name === 'StaleReactionError` */
	var STALE_REACTION = new class StaleReactionError extends Error {
		name = "StaleReactionError";
		message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
	}();
	var IS_XHTML = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml");
	//#endregion
	//#region node_modules/svelte/src/constants.js
	var HYDRATION_ERROR = {};
	var UNINITIALIZED = Symbol("uninitialized");
	var NAMESPACE_HTML = "http://www.w3.org/1999/xhtml";
	var NAMESPACE_SVG = "http://www.w3.org/2000/svg";
	var NAMESPACE_MATHML = "http://www.w3.org/1998/Math/MathML";
	var ATTACHMENT_KEY = "@attach";
	/**
	* Reading a derived belonging to a now-destroyed effect may result in stale values
	*/
	function derived_inert() {
		console.warn(`https://svelte.dev/e/derived_inert`);
	}
	/**
	* Hydration failed because the initial UI does not match what was rendered on the server. The error occurred near %location%
	* @param {string | undefined | null} [location]
	*/
	function hydration_mismatch(location) {
		console.warn(`https://svelte.dev/e/hydration_mismatch`);
	}
	/**
	* The `value` property of a `<select multiple>` element should be an array, but it received a non-array value. The selection will be kept as is.
	*/
	function select_multiple_invalid_value() {
		console.warn(`https://svelte.dev/e/select_multiple_invalid_value`);
	}
	/**
	* A `<svelte:boundary>` `reset` function only resets the boundary the first time it is called
	*/
	function svelte_boundary_reset_noop() {
		console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/hydration.js
	/** @import { TemplateNode } from '#client' */
	/**
	* Use this variable to guard everything related to hydration code so it can be treeshaken out
	* if the user doesn't use the `hydrate` method and these code paths are therefore not needed.
	*/
	var hydrating = false;
	/** @param {boolean} value */
	function set_hydrating(value) {
		hydrating = value;
	}
	/**
	* The node that is currently being hydrated. This starts out as the first node inside the opening
	* <!--[--> comment, and updates each time a component calls `$.child(...)` or `$.sibling(...)`.
	* When entering a block (e.g. `{#if ...}`), `hydrate_node` is the block opening comment; by the
	* time we leave the block it is the closing comment, which serves as the block's anchor.
	* @type {TemplateNode}
	*/
	var hydrate_node;
	/** @param {TemplateNode | null} node */
	function set_hydrate_node(node) {
		if (node === null) {
			hydration_mismatch();
			throw HYDRATION_ERROR;
		}
		return hydrate_node = node;
	}
	function hydrate_next() {
		return set_hydrate_node(/* @__PURE__ */ get_next_sibling(hydrate_node));
	}
	/** @param {TemplateNode} node */
	function reset(node) {
		if (!hydrating) return;
		if (/* @__PURE__ */ get_next_sibling(hydrate_node) !== null) {
			hydration_mismatch();
			throw HYDRATION_ERROR;
		}
		hydrate_node = node;
	}
	function next$1(count = 1) {
		if (hydrating) {
			var i = count;
			var node = hydrate_node;
			while (i--) node = /* @__PURE__ */ get_next_sibling(node);
			hydrate_node = node;
		}
	}
	/**
	* Skips or removes (depending on {@link remove}) all nodes starting at `hydrate_node` up until the next hydration end comment
	* @param {boolean} remove
	*/
	function skip_nodes(remove = true) {
		var depth = 0;
		var node = hydrate_node;
		while (true) {
			if (node.nodeType === 8) {
				var data = node.data;
				if (data === "]") {
					if (depth === 0) return node;
					depth -= 1;
				} else if (data === "[" || data === "[!" || data[0] === "[" && !isNaN(Number(data.slice(1)))) depth += 1;
			}
			var next = /* @__PURE__ */ get_next_sibling(node);
			if (remove) node.remove();
			node = next;
		}
	}
	/**
	*
	* @param {TemplateNode} node
	*/
	function read_hydration_instruction(node) {
		if (!node || node.nodeType !== 8) {
			hydration_mismatch();
			throw HYDRATION_ERROR;
		}
		return node.data;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/equality.js
	/** @import { Equals } from '#client' */
	/** @type {Equals} */
	function equals(value) {
		return value === this.v;
	}
	/**
	* @param {unknown} a
	* @param {unknown} b
	* @returns {boolean}
	*/
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || a !== null && typeof a === "object" || typeof a === "function";
	}
	/** @type {Equals} */
	function safe_equals(value) {
		return !safe_not_equal(value, this.v);
	}
	/**
	* `%name%(...)` can only be used during component initialisation
	* @param {string} name
	* @returns {never}
	*/
	function lifecycle_outside_component(name) {
		throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
	}
	/**
	* `setContext` must be called when a component first initializes, not in a subsequent effect or after an `await` expression
	* @returns {never}
	*/
	function set_context_after_init() {
		throw new Error(`https://svelte.dev/e/set_context_after_init`);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/errors.js
	/**
	* Cannot create a `$derived(...)` with an `await` expression outside of an effect tree
	* @returns {never}
	*/
	function async_derived_orphan() {
		throw new Error(`https://svelte.dev/e/async_derived_orphan`);
	}
	/**
	* Keyed each block has duplicate key `%value%` at indexes %a% and %b%
	* @param {string} a
	* @param {string} b
	* @param {string | undefined | null} [value]
	* @returns {never}
	*/
	function each_key_duplicate(a, b, value) {
		throw new Error(`https://svelte.dev/e/each_key_duplicate`);
	}
	/**
	* `%rune%` cannot be used inside an effect cleanup function
	* @param {string} rune
	* @returns {never}
	*/
	function effect_in_teardown(rune) {
		throw new Error(`https://svelte.dev/e/effect_in_teardown`);
	}
	/**
	* Effect cannot be created inside a `$derived` value that was not itself created inside an effect
	* @returns {never}
	*/
	function effect_in_unowned_derived() {
		throw new Error(`https://svelte.dev/e/effect_in_unowned_derived`);
	}
	/**
	* `%rune%` can only be used inside an effect (e.g. during component initialisation)
	* @param {string} rune
	* @returns {never}
	*/
	function effect_orphan(rune) {
		throw new Error(`https://svelte.dev/e/effect_orphan`);
	}
	/**
	* Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
	* @returns {never}
	*/
	function effect_update_depth_exceeded() {
		throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
	}
	/**
	* Cannot do `bind:%key%={undefined}` when `%key%` has a fallback value
	* @param {string} key
	* @returns {never}
	*/
	function props_invalid_value(key) {
		throw new Error(`https://svelte.dev/e/props_invalid_value`);
	}
	/**
	* Property descriptors defined on `$state` objects must contain `value` and always be `enumerable`, `configurable` and `writable`.
	* @returns {never}
	*/
	function state_descriptors_fixed() {
		throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
	}
	/**
	* Cannot set prototype of `$state` object
	* @returns {never}
	*/
	function state_prototype_fixed() {
		throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
	}
	/**
	* Updating state inside `$derived(...)`, `$inspect(...)` or a template expression is forbidden. If the value should not be reactive, declare it without `$state`
	* @returns {never}
	*/
	function state_unsafe_mutation() {
		throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
	}
	/**
	* A `<svelte:boundary>` `reset` function cannot be called while an error is still being handled
	* @returns {never}
	*/
	function svelte_boundary_reset_onerror() {
		throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/flags/index.js
	/** True if experimental.async=true */
	var async_mode_flag = false;
	/** True if we're not certain that we only have Svelte 5 code in the compilation */
	var legacy_mode_flag = false;
	function enable_legacy_mode_flag() {
		legacy_mode_flag = true;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/shared/context.js
	/**
	* @typedef {{ p: Context | null, c: Map<unknown, unknown> | null }} Context
	*/
	/**
	* @param {Context} context
	* @returns {Map<unknown, unknown> | null}
	*/
	function get_parent_context(context) {
		let parent = context.p;
		while (parent !== null && parent.c === null) parent = parent.p;
		return parent?.c ?? null;
	}
	/**
	* @param {Context | null} context
	* @param {string} name
	* @returns {Map<unknown, unknown>}
	*/
	function get_or_init_context_map(context, name) {
		if (context === null) lifecycle_outside_component(name);
		return context.c ??= new Map(get_parent_context(context) || void 0);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/context.js
	/** @import { ComponentContext, DevStackEntry, Effect } from '#client' */
	/** @type {ComponentContext | null} */
	var component_context = null;
	/** @param {ComponentContext | null} context */
	function set_component_context(context) {
		component_context = context;
	}
	/**
	* Retrieves the context set with the specified `key` in the current component or any of its
	* ancestors. If multiple components set the same key, the value from the closest one is returned.
	* A `setContext` call in the current component is only visible to `getContext` calls that run after it.
	* Must be called during component initialisation.
	*
	* [`createContext`](https://svelte.dev/docs/svelte/svelte#createContext) is a type-safe alternative.
	*
	* @template T
	* @param {any} key
	* @returns {T}
	*/
	function getContext(key) {
		return get_or_init_context_map(component_context, "getContext").get(key);
	}
	/**
	* Associates an arbitrary `context` object with the current component and the specified `key`
	* and returns that object. The context is then available to the component itself and all of its
	* descendants (including slotted content) with `getContext`.
	*
	* Like lifecycle functions, this must be called during component initialisation.
	*
	* [`createContext`](https://svelte.dev/docs/svelte/svelte#createContext) is a type-safe alternative.
	*
	* @template T
	* @param {any} key
	* @param {T} context
	* @returns {T}
	*/
	function setContext(key, context) {
		const context_map = get_or_init_context_map(component_context, "setContext");
		if (async_mode_flag) {
			var flags = active_effect.f;
			if (!(!active_reaction && (flags & 32) !== 0 && !component_context.i)) set_context_after_init();
		}
		context_map.set(key, context);
		return context;
	}
	/**
	* Checks whether a given `key` has been set in the context of the current component or any of
	* its ancestors. Must be called during component initialisation.
	*
	* @param {any} key
	* @returns {boolean}
	*/
	function hasContext(key) {
		return get_or_init_context_map(component_context, "hasContext").has(key);
	}
	/**
	* Retrieves the whole context map that belongs to the current component, including entries
	* inherited from its ancestors. Must be called during component initialisation. Useful, for
	* example, if you programmatically create a component and want to pass the existing context to it.
	*
	* @template {Map<any, any>} [T=Map<any, any>]
	* @returns {T}
	*/
	function getAllContexts() {
		return get_or_init_context_map(component_context, "getAllContexts");
	}
	/**
	* @param {Record<string, unknown>} props
	* @param {any} runes
	* @param {Function} [fn]
	* @returns {void}
	*/
	function push(props, runes = false, fn) {
		component_context = {
			p: component_context,
			i: false,
			c: null,
			e: null,
			s: props,
			x: null,
			r: active_effect,
			l: legacy_mode_flag && !runes ? {
				s: null,
				u: null,
				$: []
			} : null
		};
	}
	/**
	* @template {Record<string, any>} T
	* @param {T} [component]
	* @returns {T}
	*/
	function pop(component) {
		var context = component_context;
		var effects = context.e;
		if (effects !== null) {
			context.e = null;
			for (var fn of effects) create_user_effect(fn);
		}
		if (component !== void 0) context.x = component;
		context.i = true;
		component_context = context.p;
		return mark_as_component(component);
	}
	/**
	* Add a symbol to the object (or create one if undefined) to mark it as a component so it isn't proxified.
	* @param {any} component
	*/
	function mark_as_component(component = {}) {
		define_property(component, COMPONENT_SYMBOL, { value: true });
		return component;
	}
	/** @returns {boolean} */
	function is_runes() {
		return !legacy_mode_flag || component_context !== null && component_context.l === null;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/task.js
	/** @type {Array<() => void>} */
	var micro_tasks = [];
	function run_micro_tasks() {
		var tasks = micro_tasks;
		micro_tasks = [];
		run_all(tasks);
	}
	/**
	* @param {() => void} fn
	*/
	function queue_micro_task(fn) {
		if (micro_tasks.length === 0 && !is_flushing_sync) {
			var tasks = micro_tasks;
			queueMicrotask(() => {
				if (tasks === micro_tasks) run_micro_tasks();
			});
		}
		micro_tasks.push(fn);
	}
	/**
	* Synchronously run any queued tasks.
	*/
	function flush_tasks() {
		while (micro_tasks.length > 0) run_micro_tasks();
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/status.js
	/** @import { Derived, Signal } from '#client' */
	var STATUS_MASK = ~(DIRTY | MAYBE_DIRTY | CLEAN);
	/**
	* @param {Signal} signal
	* @param {number} status
	*/
	function set_signal_status(signal, status) {
		signal.f = signal.f & STATUS_MASK | status;
	}
	/**
	* Set a derived's status to CLEAN or MAYBE_DIRTY based on its connection state.
	* @param {Derived} derived
	*/
	function update_derived_status(derived) {
		if ((derived.f & 512) !== 0 || derived.deps === null) set_signal_status(derived, CLEAN);
		else set_signal_status(derived, MAYBE_DIRTY);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/utils.js
	/** @import { Effect } from '#client' */
	/**
	* @param {Effect} effect
	* @param {Set<Effect>} dirty_effects
	* @param {Set<Effect>} maybe_dirty_effects
	*/
	function defer_effect(effect, dirty_effects, maybe_dirty_effects) {
		if ((effect.f & 2048) !== 0) dirty_effects.add(effect);
		else if ((effect.f & 4096) !== 0) maybe_dirty_effects.add(effect);
		set_signal_status(effect, CLEAN);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/misc.js
	/**
	* @param {HTMLElement} dom
	* @param {boolean} value
	* @returns {void}
	*/
	function autofocus(dom, value) {
		if (value) {
			const body = document.body;
			dom.autofocus = true;
			queue_micro_task(() => {
				if (document.activeElement === body) dom.focus();
			});
		}
	}
	var listening_to_form_reset = false;
	function add_form_reset_listener() {
		if (!listening_to_form_reset) {
			listening_to_form_reset = true;
			document.addEventListener("reset", (evt) => {
				Promise.resolve().then(() => {
					if (!evt.defaultPrevented) for (const e of evt.target.elements)
 /** @type {any} */ e[FORM_RESET_HANDLER]?.();
				});
			}, { capture: true });
		}
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
	/**
	* @template T
	* @param {() => T} fn
	*/
	function without_reactive_context(fn) {
		var previous_reaction = active_reaction;
		var previous_effect = active_effect;
		set_active_reaction(null);
		set_active_effect(null);
		try {
			return fn();
		} finally {
			set_active_reaction(previous_reaction);
			set_active_effect(previous_effect);
		}
	}
	/**
	* Listen to the given event, and then instantiate a global form reset listener if not already done,
	* to notify all bindings when the form is reset
	* @param {HTMLElement} element
	* @param {string} event
	* @param {(is_reset?: true) => void} handler
	* @param {(is_reset?: true) => void} [on_reset]
	*/
	function listen_to_event_and_reset_event(element, event, handler, on_reset = handler) {
		element.addEventListener(event, () => without_reactive_context(handler));
		const prev = element[FORM_RESET_HANDLER];
		if (prev)
 /** @type {any} */ element[FORM_RESET_HANDLER] = () => {
			prev();
			on_reset(true);
		};
		else
 /** @type {any} */ element[FORM_RESET_HANDLER] = () => on_reset(true);
		add_form_reset_listener();
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/async.js
	/** @import { Blocker, Effect, Source, Value } from '#client' */
	/**
	* @param {Blocker[]} blockers
	* @param {Array<() => any>} sync
	* @param {Array<() => Promise<any>>} async
	* @param {(values: Value[]) => any} fn
	*/
	function flatten(blockers, sync, async, fn) {
		const d = is_runes() ? derived : derived_safe_equal;
		var pending = blockers.filter((b) => !b.settled);
		var deriveds = sync.map(d);
		if (async.length === 0 && pending.length === 0) {
			fn(deriveds);
			return;
		}
		var parent = active_effect;
		var restore = capture();
		var blocker_promise = pending.length === 1 ? pending[0].promise : pending.length > 1 ? Promise.all(pending.map((b) => b.promise)) : null;
		/**
		* @param {Source[]} async
		*/
		function finish(async) {
			if ((parent.f & 16384) !== 0) return;
			restore();
			try {
				fn([...deriveds, ...async]);
			} catch (error) {
				invoke_error_boundary(error, parent);
			}
			unset_context();
		}
		var decrement_pending = increment_pending();
		if (async.length === 0) {
			/** @type {Promise<any>} */ blocker_promise.then(() => finish([])).finally(decrement_pending);
			return;
		}
		function run() {
			Promise.all(async.map((expression) => /* @__PURE__ */ async_derived(expression))).then(finish).catch((error) => invoke_error_boundary(error, parent)).finally(decrement_pending);
		}
		if (blocker_promise) blocker_promise.then(() => {
			restore();
			run();
			unset_context();
		});
		else run();
	}
	/**
	* Captures the current effect context so that we can restore it after
	* some asynchronous work has happened (so that e.g. `await a + b`
	* causes `b` to be registered as a dependency).
	*/
	function capture() {
		var previous_effect = active_effect;
		var previous_reaction = active_reaction;
		var previous_component_context = component_context;
		var previous_batch = current_batch;
		return function restore(activate_batch = true) {
			set_active_effect(previous_effect);
			set_active_reaction(previous_reaction);
			set_component_context(previous_component_context);
			if (activate_batch && (previous_effect.f & 16384) === 0) {
				previous_batch?.activate();
				previous_batch?.apply();
			}
		};
	}
	function unset_context(deactivate_batch = true) {
		set_active_effect(null);
		set_active_reaction(null);
		set_component_context(null);
		if (deactivate_batch) current_batch?.deactivate();
	}
	/**
	* @returns {(skip?: boolean) => void}
	*/
	function increment_pending() {
		var effect = active_effect;
		var boundary = effect.b;
		var batch = current_batch;
		var blocking = !!boundary?.is_rendered();
		boundary?.update_pending_count(1, batch);
		batch.increment(blocking, effect);
		return () => {
			boundary?.update_pending_count(-1, batch);
			batch.decrement(blocking, effect);
		};
	}
	/**
	* @template V
	* @param {() => V} fn
	* @returns {Derived<V>}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function derived(fn) {
		var flags = 2 | DIRTY;
		if (active_effect !== null) active_effect.f |= EFFECT_PRESERVED;
		return {
			ctx: component_context,
			deps: null,
			effects: null,
			equals,
			f: flags,
			fn,
			reactions: null,
			rv: 0,
			v: UNINITIALIZED,
			wv: 0,
			parent: active_effect,
			ac: null
		};
	}
	var OBSOLETE = Symbol("obsolete");
	/**
	* @template V
	* @param {() => V | Promise<V>} fn
	* @param {string} [label]
	* @param {string} [location] If provided, print a warning if the value is not read immediately after update
	* @returns {Promise<Source<V>>}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function async_derived(fn, label, location) {
		let parent = active_effect;
		if (parent === null) async_derived_orphan();
		var promise = void 0;
		var signal = source(UNINITIALIZED);
		var should_suspend = !active_reaction;
		/** @type {Set<ReturnType<typeof deferred<V>>>} */
		var deferreds = /* @__PURE__ */ new Set();
		async_effect(() => {
			var effect = active_effect;
			/** @type {ReturnType<typeof deferred<V>>} */
			var d = deferred();
			promise = d.promise;
			try {
				Promise.resolve(fn()).then(d.resolve, (e) => {
					if (e !== STALE_REACTION) d.reject(e);
				}).finally(unset_context);
			} catch (error) {
				d.reject(error);
				unset_context();
			}
			var batch = current_batch;
			if (should_suspend) {
				if ((effect.f & 32768) !== 0) var decrement_pending = increment_pending();
				if (parent.b?.is_rendered()) batch.async_deriveds.get(effect)?.reject(OBSOLETE);
				else for (const d of deferreds.values()) d.reject(OBSOLETE);
				deferreds.add(d);
				batch.async_deriveds.set(effect, d);
			}
			/**
			* @param {any} value
			* @param {unknown} error
			*/
			const handler = (value, error = void 0) => {
				decrement_pending?.();
				deferreds.delete(d);
				if (error === OBSOLETE) return;
				batch.activate();
				if (error) {
					signal.f |= ERROR_VALUE;
					internal_set(signal, error);
				} else {
					if ((signal.f & 8388608) !== 0) signal.f ^= ERROR_VALUE;
					internal_set(signal, value);
				}
				batch.deactivate();
			};
			d.promise.then(handler, (e) => handler(null, e || "unknown"));
		});
		teardown(() => {
			for (const d of deferreds) d.reject(OBSOLETE);
		});
		return new Promise((fulfil) => {
			/** @param {Promise<V>} p */
			function next(p) {
				function go() {
					if (p === promise) fulfil(signal);
					else next(promise);
				}
				p.then(go, go);
			}
			next(promise);
		});
	}
	/**
	* @template V
	* @param {() => V} fn
	* @returns {Derived<V>}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function user_derived(fn) {
		const d = /* @__PURE__ */ derived(fn);
		if (!async_mode_flag) push_reaction_value(d);
		return d;
	}
	/**
	* @template V
	* @param {() => V} fn
	* @returns {Derived<V>}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function derived_safe_equal(fn) {
		const signal = /* @__PURE__ */ derived(fn);
		signal.equals = safe_equals;
		return signal;
	}
	/**
	* @param {Derived} derived
	* @returns {void}
	*/
	function destroy_derived_effects(derived) {
		var effects = derived.effects;
		if (effects !== null) {
			derived.effects = null;
			for (var i = 0; i < effects.length; i += 1) destroy_effect(effects[i]);
		}
	}
	/**
	* @template T
	* @param {Derived} derived
	* @returns {T}
	*/
	function execute_derived(derived) {
		var value;
		var prev_active_effect = active_effect;
		var parent = derived.parent;
		if (!is_destroying_effect && parent !== null && derived.v !== UNINITIALIZED && (parent.f & 24576) !== 0) {
			derived_inert();
			return derived.v;
		}
		set_active_effect(parent);
		try {
			destroy_derived_effects(derived);
			value = update_reaction(derived);
		} finally {
			set_active_effect(prev_active_effect);
		}
		return value;
	}
	/**
	* @param {Derived} derived
	* @returns {void}
	*/
	function update_derived(derived) {
		var value = execute_derived(derived);
		if (!derived.equals(value)) {
			derived.wv = increment_write_version();
			if (!current_batch?.is_fork || derived.deps === null) {
				if (current_batch !== null) {
					current_batch.capture(derived, value, true);
					previous_batch?.capture(derived, value, true);
				} else derived.v = value;
				if (derived.deps === null) {
					set_signal_status(derived, CLEAN);
					return;
				}
			}
		}
		if (is_destroying_effect) return;
		if (batch_values !== null) {
			if (effect_tracking() || current_batch?.is_fork) batch_values.set(derived, value);
		} else update_derived_status(derived);
	}
	/**
	* @param {Derived} derived
	*/
	function freeze_derived_effects(derived) {
		if (derived.effects === null) return;
		for (const e of derived.effects) if (e.teardown || e.ac) {
			e.teardown?.();
			if (e.ac !== null) without_reactive_context(() => {
				/** @type {AbortController} */ e.ac.abort(STALE_REACTION);
				e.ac = null;
			});
			if (e.fn !== null) e.teardown = noop$1;
			remove_reactions(e, 0);
			destroy_effect_children(e);
		}
	}
	/**
	* @param {Derived} derived
	*/
	function unfreeze_derived_effects(derived) {
		if (derived.effects === null) return;
		for (const e of derived.effects) if (e.teardown && e.fn !== null) update_effect(e);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/batch.js
	/** @import { Fork } from 'svelte' */
	/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */
	/** @type {Batch | null} */
	var first_batch = null;
	/** @type {Batch | null} */
	var last_batch = null;
	/** @type {Batch | null} */
	var current_batch = null;
	/**
	* This is needed to avoid overwriting inputs
	* @type {Batch | null}
	*/
	var previous_batch = null;
	/**
	* When time travelling (i.e. working in one batch, while other batches
	* still have ongoing work), we ignore the real values of affected
	* signals in favour of their values within the batch
	* @type {Map<Value, any> | null}
	*/
	var batch_values = null;
	/** @type {Effect | null} */
	var last_scheduled_effect = null;
	var is_flushing_sync = false;
	var is_processing = false;
	/**
	* During traversal, this is an array. Newly created effects are (if not immediately
	* executed) pushed to this array, rather than going through the scheduling
	* rigamarole that would cause another turn of the flush loop.
	* @type {Effect[] | null}
	*/
	var collected_effects = null;
	/**
	* An array of effects that are marked during traversal as a result of a `set`
	* (not `internal_set`) call. These will be added to the next batch and
	* trigger another `batch.process()`
	* @type {Effect[] | null}
	* @deprecated when we get rid of legacy mode and stores, we can get rid of this
	*/
	var legacy_updates = null;
	var flush_count = 0;
	var uid = 1;
	var Batch = class Batch {
		id = uid++;
		/** True as soon as `#process` was called */
		#started = false;
		linked = true;
		/** @type {Batch | null} */
		#prev = null;
		/** @type {Batch | null} */
		#next = null;
		/** @type {Map<Effect, ReturnType<typeof deferred<any>>>} */
		async_deriveds = /* @__PURE__ */ new Map();
		/**
		* The current values of any signals that are updated in this batch.
		* Tuple format: [value, is_derived] (note: is_derived is false for deriveds, too, if they were overridden via assignment)
		* They keys of this map are identical to `this.#previous`
		* @type {Map<Value, [any, boolean]>}
		*/
		current = /* @__PURE__ */ new Map();
		/**
		* The values of any signals (sources and deriveds) that are updated in this batch _before_ those updates took place.
		* They keys of this map are identical to `this.#current`
		* @type {Map<Value, any>}
		*/
		previous = /* @__PURE__ */ new Map();
		/**
		* When the batch is committed (and the DOM is updated), we need to remove old branches
		* and append new ones by calling the functions added inside (if/each/key/etc) blocks
		* @type {Set<(batch: Batch) => void>}
		*/
		#commit_callbacks = /* @__PURE__ */ new Set();
		/**
		* If a fork is discarded, we need to destroy any effects that are no longer needed
		* @type {Set<(batch: Batch) => void>}
		*/
		#discard_callbacks = /* @__PURE__ */ new Set();
		/**
		* The number of async effects that are currently in flight
		*/
		#pending = 0;
		/**
		* Async effects that are currently in flight, _not_ inside a pending boundary
		* @type {Map<Effect, number>}
		*/
		#blocking_pending = /* @__PURE__ */ new Map();
		/**
		* A deferred that resolves when the batch is committed, used with `settled()`
		* TODO replace with Promise.withResolvers once supported widely enough
		* @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
		*/
		#deferred = null;
		/**
		* Effects that were scheduled in this batch but not yet 'resolved' into the
		* root effects that need to be flushed. Resolving — the upwards traversal that
		* marks the path to each effect on the shared effect tree (see #resolve) — is
		* deferred until the batch is processed, so that the markers are created and
		* consumed within a single traversal. Scheduling into other batches (which can
		* happen concurrently, e.g. while a batch is committed) can therefore never
		* observe (and be confused by) this batch's markers.
		* May contain duplicates — deduplication happens during resolving
		* @type {Effect[]}
		*/
		#scheduled = [];
		/**
		* Effects created while this batch was active.
		* @type {Effect[]}
		*/
		#new_effects = [];
		/**
		* Deferred effects (which run after async work has completed) that are DIRTY
		* @type {Set<Effect>}
		*/
		#dirty_effects = /* @__PURE__ */ new Set();
		/**
		* Deferred effects that are MAYBE_DIRTY
		* @type {Set<Effect>}
		*/
		#maybe_dirty_effects = /* @__PURE__ */ new Set();
		/**
		* A map of branches that still exist, but will be destroyed when this batch
		* is committed — we skip over these during `process`.
		* The value contains child effects that were dirty/maybe_dirty before being reset,
		* so they can be rescheduled if the branch survives.
		* @type {Map<Effect, { d: Effect[], m: Effect[] }>}
		*/
		#skipped_branches = /* @__PURE__ */ new Map();
		/**
		* Inverse of #skipped_branches which we need to tell prior batches to unskip them when committing
		* @type {Set<Effect>}
		*/
		#unskipped_branches = /* @__PURE__ */ new Set();
		is_fork = false;
		#decrement_queued = false;
		constructor() {
			if (last_batch === null) first_batch = last_batch = this;
			else {
				last_batch.#next = this;
				this.#prev = last_batch;
			}
			last_batch = this;
		}
		#is_deferred() {
			if (this.is_fork) return true;
			for (const effect of this.#blocking_pending.keys()) {
				var e = effect;
				var skipped = false;
				while (e.parent !== null) {
					if (this.#skipped_branches.has(e)) {
						skipped = true;
						break;
					}
					e = e.parent;
				}
				if (!skipped) return true;
			}
			return false;
		}
		/**
		* Add an effect to the #skipped_branches map and reset its children
		* @param {Effect} effect
		*/
		skip_effect(effect) {
			if (!this.#skipped_branches.has(effect)) this.#skipped_branches.set(effect, {
				d: [],
				m: []
			});
			this.#unskipped_branches.delete(effect);
		}
		/**
		* Remove an effect from the #skipped_branches map and reschedule
		* any tracked dirty/maybe_dirty child effects
		* @param {Effect} effect
		* @param {(e: Effect) => void} callback
		*/
		unskip_effect(effect, callback = (e) => this.schedule(e)) {
			var tracked = this.#skipped_branches.get(effect);
			if (tracked) {
				this.#skipped_branches.delete(effect);
				for (var e of tracked.d) {
					set_signal_status(e, DIRTY);
					callback(e);
				}
				for (e of tracked.m) {
					set_signal_status(e, MAYBE_DIRTY);
					callback(e);
				}
			}
			this.#unskipped_branches.add(effect);
		}
		/**
		* Convert the effects that were scheduled in this batch into the root effects
		* that need to be traversed, marking the path to each effect (by clearing the
		* `CLEAN` flag on ancestor branches) so that the traversal can find them.
		* This happens right before traversal rather than at scheduling time, so that
		* the markers left on the (shared) effect tree are created and consumed within
		* a single traversal — scheduling into other batches can never observe them
		* @returns {Effect[]}
		*/
		#resolve() {
			/** @type {Effect[]} */
			var roots = [];
			for (const effect of this.#scheduled) {
				if ((effect.f & 16384) !== 0 || (effect.f & 6144) === 0) continue;
				var e = effect;
				var covered = false;
				while (e.parent !== null) {
					e = e.parent;
					var flags = e.f;
					if ((flags & 96) !== 0) {
						if ((flags & 1024) === 0) {
							covered = true;
							break;
						}
						e.f ^= CLEAN;
					}
				}
				if (!covered) roots.push(e);
			}
			this.#scheduled = [];
			return roots;
		}
		#process() {
			this.#started = true;
			for (const e of this.#dirty_effects) {
				this.#maybe_dirty_effects.delete(e);
				set_signal_status(e, DIRTY);
				this.schedule(e);
			}
			for (const e of this.#maybe_dirty_effects) {
				set_signal_status(e, MAYBE_DIRTY);
				this.schedule(e);
			}
			this.apply();
			/** @type {Effect[]} */
			var effects = collected_effects = [];
			/** @type {Effect[]} */
			var render_effects = [];
			/**
			* @type {Effect[]}
			* @deprecated when we get rid of legacy mode and stores, we can get rid of this
			*/
			var updates = legacy_updates = [];
			while (this.#scheduled.length > 0) {
				if (flush_count++ > 1e3) {
					this.#unlink();
					infinite_loop_guard();
				}
				for (const root of this.#resolve()) try {
					this.#traverse(root, effects, render_effects);
				} catch (e) {
					reset_all(root);
					if (!this.#is_deferred()) this.discard();
					throw e;
				}
			}
			current_batch = null;
			if (updates.length > 0) {
				var batch = Batch.ensure();
				for (const e of updates) batch.schedule(e);
			}
			collected_effects = null;
			legacy_updates = null;
			if (this.#is_deferred()) {
				this.#defer_effects(render_effects);
				this.#defer_effects(effects);
				for (const [e, t] of this.#skipped_branches) reset_branch(e, t);
				if (updates.length > 0)
 /** @type {Batch} */ current_batch.#process();
				return;
			}
			const earlier_batch = this.#find_earlier_batch();
			if (earlier_batch) {
				this.#defer_effects(render_effects);
				this.#defer_effects(effects);
				earlier_batch.#merge(this);
				return;
			}
			this.#dirty_effects.clear();
			this.#maybe_dirty_effects.clear();
			for (const fn of this.#commit_callbacks) fn(this);
			this.#commit_callbacks.clear();
			previous_batch = this;
			flush_queued_effects(render_effects);
			flush_queued_effects(effects);
			previous_batch = null;
			this.#deferred?.resolve();
			var next_batch = current_batch;
			if (this.#pending === 0 && (this.#scheduled.length === 0 || next_batch !== null)) {
				this.#unlink();
				if (async_mode_flag) {
					this.#commit();
					current_batch = next_batch;
				}
			}
			if (this.#scheduled.length > 0) {
				if (next_batch !== null) {
					for (const e of this.#scheduled) next_batch.#scheduled.push(e);
					this.#scheduled = [];
				} else next_batch = this;
			}
			if (next_batch !== null) {
				old_values.clear();
				next_batch.#process();
			}
		}
		/**
		* Traverse the effect tree, executing effects or stashing
		* them for later execution as appropriate
		* @param {Effect} root
		* @param {Effect[]} effects
		* @param {Effect[]} render_effects
		*/
		#traverse(root, effects, render_effects) {
			root.f ^= CLEAN;
			var effect = root.first;
			while (effect !== null) {
				var flags = effect.f;
				var is_branch = (flags & 96) !== 0;
				if (!(is_branch && (flags & 1024) !== 0 || (flags & 8192) !== 0 || this.#skipped_branches.has(effect)) && effect.fn !== null) {
					if (is_branch) effect.f ^= CLEAN;
					else if ((flags & 4) !== 0) effects.push(effect);
					else if (async_mode_flag && (flags & 16777224) !== 0) render_effects.push(effect);
					else if (is_dirty(effect)) {
						if ((flags & 16) !== 0) this.#maybe_dirty_effects.add(effect);
						update_effect(effect);
					}
					var child = effect.first;
					if (child !== null) {
						effect = child;
						continue;
					}
				}
				while (effect !== null) {
					var next = effect.next;
					if (next !== null) {
						effect = next;
						break;
					}
					effect = effect.parent;
				}
			}
		}
		#find_earlier_batch() {
			var batch = this.#prev;
			while (batch !== null) {
				if (!batch.is_fork) {
					for (const [value, [, is_derived]] of this.current) if (batch.current.has(value) && !is_derived) return batch;
				}
				batch = batch.#prev;
			}
			return null;
		}
		/**
		* @param {Batch} batch
		*/
		#merge(batch) {
			for (const [source, value] of batch.current) {
				if (!this.previous.has(source) && batch.previous.has(source)) this.previous.set(source, batch.previous.get(source));
				this.current.set(source, value);
			}
			for (const [effect, deferred] of batch.async_deriveds) {
				const d = this.async_deriveds.get(effect);
				if (d) deferred.promise.then(d.resolve).catch(d.reject);
			}
			batch.async_deriveds.clear();
			this.transfer_effects(batch.#dirty_effects, batch.#maybe_dirty_effects);
			/**
			* mark all effects that depend on `batch.current`, except the
			* async effects that we just resolved (TODO unless they depend
			* on values in this batch that are NOT in the later batch?).
			* Through this we also will populate the correct #skipped_branches,
			* oncommit callbacks etc, so we don't need to merge them separately.
			* @param {Value} value
			*/
			const mark = (value) => {
				var reactions = value.reactions;
				if (reactions === null) return;
				if ((value.f & 2) !== 0 && (value.f & 6144) === 0) return;
				for (const reaction of reactions) {
					var flags = reaction.f;
					if ((flags & 2) !== 0) mark(reaction);
					else {
						var effect = reaction;
						if (flags & 4194320 && !this.async_deriveds.has(effect)) {
							this.#maybe_dirty_effects.delete(effect);
							set_signal_status(effect, DIRTY);
							this.schedule(effect);
						}
					}
				}
			};
			for (const source of this.current.keys()) mark(source);
			this.oncommit(() => batch.discard());
			batch.#unlink();
			current_batch = this;
			this.#process();
		}
		/**
		* @param {Effect[]} effects
		*/
		#defer_effects(effects) {
			for (var i = 0; i < effects.length; i += 1) defer_effect(effects[i], this.#dirty_effects, this.#maybe_dirty_effects);
		}
		/**
		* Associate a change to a given source with the current
		* batch, noting its previous and current values
		* @param {Value} source
		* @param {any} value
		* @param {boolean} [is_derived]
		*/
		capture(source, value, is_derived = false) {
			if (source.v !== UNINITIALIZED && !this.previous.has(source)) this.previous.set(source, source.v);
			if ((source.f & 8388608) === 0) {
				this.current.set(source, [value, is_derived]);
				batch_values?.set(source, value);
			}
			if (!this.is_fork) source.v = value;
		}
		activate() {
			current_batch = this;
		}
		deactivate() {
			current_batch = null;
			batch_values = null;
		}
		flush() {
			try {
				is_processing = true;
				current_batch = this;
				this.#process();
			} finally {
				flush_count = 0;
				last_scheduled_effect = null;
				collected_effects = null;
				legacy_updates = null;
				is_processing = false;
				current_batch = null;
				batch_values = null;
				old_values.clear();
			}
		}
		discard() {
			for (const fn of this.#discard_callbacks) fn(this);
			this.#discard_callbacks.clear();
			for (const deferred of this.async_deriveds.values()) deferred.reject(OBSOLETE);
			this.#unlink();
			this.#deferred?.resolve();
		}
		/**
		* @param {Effect} effect
		*/
		register_created_effect(effect) {
			this.#new_effects.push(effect);
		}
		#commit() {
			for (let batch = first_batch; batch !== null; batch = batch.#next) {
				var is_earlier = batch.id < this.id;
				/** @type {Source[]} */
				var sources = [];
				for (const [source, [value, is_derived]] of this.current) {
					if (batch.current.has(source)) {
						var batch_value = batch.current.get(source)[0];
						if (is_earlier && value !== batch_value) batch.current.set(source, [value, is_derived]);
						else continue;
					}
					sources.push(source);
				}
				if (is_earlier) for (const [effect, deferred] of this.async_deriveds) {
					const d = batch.async_deriveds.get(effect);
					if (d) deferred.promise.then(d.resolve).catch(d.reject);
				}
				var current = [...batch.current.keys()].filter((source) => !batch.current.get(source)[1]);
				if (!batch.#started || current.length === 0) continue;
				var others = current.filter((source) => !this.current.has(source));
				if (others.length === 0) {
					if (is_earlier) batch.discard();
				} else if (sources.length > 0) {
					if (is_earlier) for (const unskipped of this.#unskipped_branches) batch.unskip_effect(unskipped, (e) => {
						if ((e.f & 4194320) !== 0) batch.schedule(e);
						else batch.#defer_effects([e]);
					});
					batch.activate();
					/** @type {Set<Value>} */
					var marked = /* @__PURE__ */ new Set();
					/** @type {Map<Reaction, boolean>} */
					var checked = /* @__PURE__ */ new Map();
					for (var source of sources) mark_effects(source, others, marked, checked);
					checked = /* @__PURE__ */ new Map();
					var current_unequal = [...batch.current].filter(([c, v1]) => {
						const v2 = this.current.get(c);
						if (!v2) return true;
						return v2[0] !== v1[0] || v2[1] !== v1[1];
					}).map(([c]) => c);
					if (current_unequal.length > 0) {
						for (const effect of this.#new_effects) if ((effect.f & 155648) === 0 && depends_on(effect, current_unequal, checked)) {
							if ((effect.f & 4194320) !== 0) {
								set_signal_status(effect, DIRTY);
								batch.schedule(effect);
							} else batch.#dirty_effects.add(effect);
						}
					}
					if (batch.#scheduled.length > 0 && !batch.#decrement_queued) {
						batch.apply();
						for (var root of batch.#resolve()) batch.#traverse(root, [], []);
					}
					batch.deactivate();
				}
			}
		}
		/**
		* @param {boolean} blocking
		* @param {Effect} effect
		*/
		increment(blocking, effect) {
			this.#pending += 1;
			if (blocking) {
				let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
				this.#blocking_pending.set(effect, blocking_pending_count + 1);
			}
		}
		/**
		* @param {boolean} blocking
		* @param {Effect} effect
		*/
		decrement(blocking, effect) {
			this.#pending -= 1;
			if (blocking) {
				let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
				if (blocking_pending_count === 1) this.#blocking_pending.delete(effect);
				else this.#blocking_pending.set(effect, blocking_pending_count - 1);
			}
			if (this.#decrement_queued) return;
			this.#decrement_queued = true;
			queue_micro_task(() => {
				this.#decrement_queued = false;
				if (this.linked) this.flush();
			});
		}
		/**
		* @param {Set<Effect>} dirty_effects
		* @param {Set<Effect>} maybe_dirty_effects
		*/
		transfer_effects(dirty_effects, maybe_dirty_effects) {
			for (const e of dirty_effects) this.#dirty_effects.add(e);
			for (const e of maybe_dirty_effects) this.#maybe_dirty_effects.add(e);
			dirty_effects.clear();
			maybe_dirty_effects.clear();
		}
		/** @param {(batch: Batch) => void} fn */
		oncommit(fn) {
			this.#commit_callbacks.add(fn);
		}
		/** @param {(batch: Batch) => void} fn */
		ondiscard(fn) {
			this.#discard_callbacks.add(fn);
		}
		settled() {
			return (this.#deferred ??= deferred()).promise;
		}
		static ensure() {
			if (current_batch === null) {
				const batch = current_batch = new Batch();
				if (!is_processing && !is_flushing_sync) queue_micro_task(() => {
					if (!batch.#started) batch.flush();
				});
			}
			return current_batch;
		}
		apply() {
			if (!async_mode_flag || !this.is_fork && this.#prev === null && this.#next === null) {
				batch_values = null;
				return;
			}
			batch_values = /* @__PURE__ */ new Map();
			for (const [source, [value]] of this.current) batch_values.set(source, value);
			for (let batch = first_batch; batch !== null; batch = batch.#next) {
				if (batch === this || batch.is_fork) continue;
				var intersects = false;
				if (batch.id < this.id) for (const [source, [, is_derived]] of batch.current) {
					if (is_derived) continue;
					if (this.current.has(source)) {
						intersects = true;
						break;
					}
				}
				if (!intersects) {
					for (const [source, previous] of batch.previous) if (!batch_values.has(source)) batch_values.set(source, previous);
				}
			}
		}
		/**
		*
		* @param {Effect} effect
		*/
		schedule(effect) {
			last_scheduled_effect = effect;
			if (effect.b?.is_pending && (effect.f & 16777228) !== 0 && (effect.f & 32768) === 0) {
				effect.b.defer_effect(effect);
				return;
			}
			this.#scheduled.push(effect);
		}
		#unlink() {
			if (!this.linked) return;
			var prev = this.#prev;
			var next = this.#next;
			if (prev === null) first_batch = next;
			else prev.#next = next;
			if (next === null) last_batch = prev;
			else next.#prev = prev;
			this.linked = false;
		}
	};
	/**
	* Synchronously flush any pending updates.
	* Returns void if no callback is provided, otherwise returns the result of calling the callback.
	* @template [T=void]
	* @param {(() => T) | undefined} [fn]
	* @returns {T}
	*/
	function flushSync(fn) {
		var was_flushing_sync = is_flushing_sync;
		is_flushing_sync = true;
		try {
			var result;
			if (fn) {
				if (current_batch !== null && !current_batch.is_fork) current_batch.flush();
				result = fn();
			}
			while (true) {
				flush_tasks();
				if (current_batch === null) return result;
				current_batch.flush();
			}
		} finally {
			is_flushing_sync = was_flushing_sync;
		}
	}
	function infinite_loop_guard() {
		try {
			effect_update_depth_exceeded();
		} catch (error) {
			invoke_error_boundary(error, last_scheduled_effect);
		}
	}
	/** @type {Set<Effect> | null} */
	var eager_block_effects = null;
	/**
	* @param {Array<Effect>} effects
	* @returns {void}
	*/
	function flush_queued_effects(effects) {
		var length = effects.length;
		if (length === 0) return;
		var i = 0;
		while (i < length) {
			var effect = effects[i++];
			if ((effect.f & 24576) === 0 && is_dirty(effect)) {
				eager_block_effects = /* @__PURE__ */ new Set();
				update_effect(effect);
				if (effect.deps === null && effect.first === null && effect.nodes === null && effect.teardown === null && effect.ac === null) unlink_effect(effect);
				if (eager_block_effects?.size > 0) {
					old_values.clear();
					for (const e of eager_block_effects) {
						if ((e.f & 24576) !== 0) continue;
						/** @type {Effect[]} */
						const ordered_effects = [e];
						let ancestor = e.parent;
						while (ancestor !== null) {
							if (eager_block_effects.has(ancestor)) {
								eager_block_effects.delete(ancestor);
								ordered_effects.push(ancestor);
							}
							ancestor = ancestor.parent;
						}
						for (let j = ordered_effects.length - 1; j >= 0; j--) {
							const e = ordered_effects[j];
							if ((e.f & 24576) !== 0) continue;
							update_effect(e);
						}
					}
					eager_block_effects.clear();
				}
			}
		}
		eager_block_effects = null;
	}
	/**
	* This is similar to `mark_reactions`, but it only marks async/block effects
	* depending on `value` and at least one of the other `sources`, so that
	* these effects can re-run after another batch has been committed
	* @param {Value} value
	* @param {Source[]} sources
	* @param {Set<Value>} marked
	* @param {Map<Reaction, boolean>} checked
	*/
	function mark_effects(value, sources, marked, checked) {
		if (marked.has(value)) return;
		marked.add(value);
		if (value.reactions !== null) for (const reaction of value.reactions) {
			const flags = reaction.f;
			if ((flags & 2) !== 0) mark_effects(reaction, sources, marked, checked);
			else if ((flags & 4194320) !== 0 && (flags & 2048) === 0 && depends_on(reaction, sources, checked)) {
				set_signal_status(reaction, DIRTY);
				schedule_effect(reaction);
			}
		}
	}
	/**
	* @param {Reaction} reaction
	* @param {Source[]} sources
	* @param {Map<Reaction, boolean>} checked
	*/
	function depends_on(reaction, sources, checked) {
		const depends = checked.get(reaction);
		if (depends !== void 0) return depends;
		if (reaction.deps !== null) for (const dep of reaction.deps) {
			if (includes.call(sources, dep)) return true;
			if ((dep.f & 2) !== 0 && depends_on(dep, sources, checked)) {
				checked.set(dep, true);
				return true;
			}
		}
		checked.set(reaction, false);
		return false;
	}
	/**
	* @param {Effect} effect
	* @returns {void}
	*/
	function schedule_effect(effect) {
		/** @type {Batch} */ current_batch.schedule(effect);
	}
	/**
	* Mark all the effects inside a skipped branch CLEAN, so that
	* they can be correctly rescheduled later. Tracks dirty and maybe_dirty
	* effects so they can be rescheduled if the branch survives.
	* @param {Effect} effect
	* @param {{ d: Effect[], m: Effect[] }} tracked
	*/
	function reset_branch(effect, tracked) {
		if ((effect.f & 32) !== 0 && (effect.f & 1024) !== 0) return;
		if ((effect.f & 2048) !== 0) tracked.d.push(effect);
		else if ((effect.f & 4096) !== 0) tracked.m.push(effect);
		set_signal_status(effect, CLEAN);
		var e = effect.first;
		while (e !== null) {
			reset_branch(e, tracked);
			e = e.next;
		}
	}
	/**
	* Mark an entire effect tree clean following an error
	* @param {Effect} effect
	*/
	function reset_all(effect) {
		set_signal_status(effect, CLEAN);
		var e = effect.first;
		while (e !== null) {
			reset_all(e);
			e = e.next;
		}
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/sources.js
	/** @import { Derived, Effect, Source, Value } from '#client' */
	/** @type {Set<Effect>} */
	var eager_effects = /* @__PURE__ */ new Set();
	/** @type {Map<Source, any>} */
	var old_values = /* @__PURE__ */ new Map();
	var eager_effects_deferred = false;
	/**
	* @template V
	* @param {V} v
	* @param {Error | null} [stack]
	* @returns {Source<V>}
	*/
	function source(v, stack) {
		return {
			f: 0,
			v,
			reactions: null,
			equals,
			rv: 0,
			wv: 0
		};
	}
	/**
	* @template V
	* @param {V} v
	* @param {Error | null} [stack]
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function state(v, stack) {
		const s = source(v, stack);
		push_reaction_value(s);
		return s;
	}
	/**
	* @template V
	* @param {V} initial_value
	* @param {boolean} [immutable]
	* @returns {Source<V>}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function mutable_source(initial_value, immutable = false, trackable = true) {
		const s = source(initial_value);
		if (!immutable) s.equals = safe_equals;
		if (legacy_mode_flag && trackable && component_context !== null && component_context.l !== null) (component_context.l.s ??= []).push(s);
		return s;
	}
	/**
	* @template V
	* @param {Source<V>} source
	* @param {V} value
	* @param {boolean} [should_proxy]
	* @returns {V}
	*/
	function set(source, value, should_proxy = false) {
		if (active_reaction !== null && (!untracking || (active_reaction.f & 131072) !== 0) && is_runes() && (active_reaction.f & 4325394) !== 0 && (current_sources === null || !current_sources.has(source))) state_unsafe_mutation();
		return internal_set(source, should_proxy ? proxy(value) : value, legacy_updates);
	}
	/**
	* A set of signals we have already seen while traversing in mark_reactions.
	* Not always set to balance the common case of sources only having a couple
	* of (transitive) dependencies (where always creating a Set would be bad for perf)
	* with the edge case of extremely deep or wide dependency arrays with cycles.
	* @type {Set<any> | null}
	*/
	var seen = null;
	/** Number of transitive dependencies, see {@link seen} for more info */
	var count_deps = 0;
	/**
	* @template V
	* @param {Source<V>} source
	* @param {V} value
	* @param {Effect[] | null} [updated_during_traversal]
	* @returns {V}
	*/
	function internal_set(source, value, updated_during_traversal = null) {
		if (!source.equals(value)) {
			if (is_destroying_effect) old_values.set(source, value);
			else if (!old_values.has(source)) old_values.set(source, source.v);
			var batch = Batch.ensure();
			batch.capture(source, value);
			if ((source.f & 2) !== 0) {
				const derived = source;
				if ((source.f & 2048) !== 0) execute_derived(derived);
				if (batch_values === null) update_derived_status(derived);
			}
			source.wv = increment_write_version();
			seen = null;
			count_deps = 0;
			mark_reactions(source, DIRTY, updated_during_traversal);
			seen = null;
			if (is_runes() && active_effect !== null && (active_effect.f & 1024) !== 0 && (active_effect.f & 96) === 0) {
				if (untracked_writes === null) set_untracked_writes([source]);
				else untracked_writes.push(source);
			}
			if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) flush_eager_effects();
		}
		return value;
	}
	function flush_eager_effects() {
		eager_effects_deferred = false;
		for (const effect of eager_effects) {
			if ((effect.f & 1024) !== 0) set_signal_status(effect, MAYBE_DIRTY);
			let dirty;
			try {
				dirty = is_dirty(effect);
			} catch {
				dirty = true;
			}
			if (dirty) update_effect(effect);
		}
		eager_effects.clear();
	}
	/**
	* Silently (without using `get`) increment a source
	* @param {Source<number>} source
	*/
	function increment(source) {
		set(source, source.v + 1);
	}
	/**
	* @param {Value} signal
	* @param {number} status should be DIRTY or MAYBE_DIRTY
	* @param {Effect[] | null} updated_during_traversal
	* @returns {void}
	*/
	function mark_reactions(signal, status, updated_during_traversal) {
		var reactions = signal.reactions;
		if (reactions === null) return;
		var runes = is_runes();
		var length = reactions.length;
		count_deps += length;
		if (count_deps > 1e5 && seen === null) seen = /* @__PURE__ */ new Set();
		if (seen !== null) {
			if (seen.has(signal)) return;
			seen.add(signal);
		}
		for (var i = 0; i < length; i++) {
			var reaction = reactions[i];
			var flags = reaction.f;
			if (!runes && reaction === active_effect) continue;
			var not_dirty = (flags & DIRTY) === 0;
			if (not_dirty) set_signal_status(reaction, status);
			if ((flags & 131072) !== 0) eager_effects.add(reaction);
			else if ((flags & 2) !== 0) {
				var derived = reaction;
				batch_values?.delete(derived);
				mark_reactions(derived, MAYBE_DIRTY, updated_during_traversal);
			} else if (not_dirty) {
				var effect = reaction;
				if ((flags & 16) !== 0 && eager_block_effects !== null) eager_block_effects.add(effect);
				if (updated_during_traversal !== null) updated_during_traversal.push(effect);
				else schedule_effect(effect);
			}
		}
	}
	/**
	* @template T
	* @param {T} value
	* @returns {T}
	*/
	function proxy(value) {
		if (typeof value !== "object" || value === null || STATE_SYMBOL in value || COMPONENT_SYMBOL in value) return value;
		const prototype = get_prototype_of(value);
		if (prototype !== object_prototype && prototype !== array_prototype) return value;
		/** @type {Map<any, Source<any>>} */
		var sources = /* @__PURE__ */ new Map();
		var is_proxied_array = is_array(value);
		var version = /* @__PURE__ */ state(0);
		var stack = null;
		var parent_version = update_version;
		/**
		* Executes the proxy in the context of the reaction it was originally created in, if any
		* @template T
		* @param {() => T} fn
		*/
		var with_parent = (fn) => {
			if (update_version === parent_version) return fn();
			var reaction = active_reaction;
			var version = update_version;
			set_active_reaction(null);
			set_update_version(parent_version);
			var result = fn();
			set_active_reaction(reaction);
			set_update_version(version);
			return result;
		};
		if (is_proxied_array) sources.set("length", /* @__PURE__ */ state(
			/** @type {any[]} */
			value.length,
			stack
		));
		return new Proxy(value, {
			defineProperty(_, prop, descriptor) {
				if (!("value" in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) state_descriptors_fixed();
				var s = sources.get(prop);
				if (s === void 0) with_parent(() => {
					var s = /* @__PURE__ */ state(descriptor.value, stack);
					sources.set(prop, s);
					return s;
				});
				else set(s, descriptor.value, true);
				return true;
			},
			deleteProperty(target, prop) {
				var s = sources.get(prop);
				if (s === void 0) {
					if (prop in target) {
						const s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED, stack));
						sources.set(prop, s);
						increment(version);
					}
				} else {
					set(s, UNINITIALIZED);
					increment(version);
				}
				return true;
			},
			get(target, prop, receiver) {
				if (prop === STATE_SYMBOL) return value;
				var s = sources.get(prop);
				var exists = prop in target;
				if (s === void 0 && (!exists || get_descriptor(target, prop)?.writable)) {
					s = with_parent(() => {
						return /* @__PURE__ */ state(proxy(exists ? target[prop] : UNINITIALIZED), stack);
					});
					sources.set(prop, s);
				}
				if (s !== void 0) {
					var v = get$2(s);
					return v === UNINITIALIZED ? void 0 : v;
				}
				return Reflect.get(target, prop, receiver);
			},
			getOwnPropertyDescriptor(target, prop) {
				this.has?.(target, prop);
				var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
				var s = sources.get(prop);
				if (s !== void 0) {
					var value = get$2(s);
					if (value === UNINITIALIZED) return;
					if (descriptor && "value" in descriptor) descriptor.value = value;
					else return {
						enumerable: true,
						configurable: true,
						value,
						writable: true
					};
				}
				return descriptor;
			},
			has(target, prop) {
				if (prop === STATE_SYMBOL) return true;
				var s = sources.get(prop);
				var has = s !== void 0 && s.v !== UNINITIALIZED || Reflect.has(target, prop);
				if (s !== void 0 || active_effect !== null && (!has || get_descriptor(target, prop)?.writable)) {
					if (s === void 0) {
						s = with_parent(() => {
							return /* @__PURE__ */ state(has ? proxy(target[prop]) : UNINITIALIZED, stack);
						});
						sources.set(prop, s);
					}
					if (get$2(s) === UNINITIALIZED) return false;
				}
				return has;
			},
			set(target, prop, value, receiver) {
				var s = sources.get(prop);
				var has = prop in target;
				if (is_proxied_array && prop === "length") for (var i = value; i < s.v; i += 1) {
					var other_s = sources.get(i + "");
					if (other_s !== void 0) set(other_s, UNINITIALIZED);
					else if (i in target) {
						other_s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED, stack));
						sources.set(i + "", other_s);
					}
				}
				if (s === void 0) {
					if (!has || get_descriptor(target, prop)?.writable) {
						s = with_parent(() => /* @__PURE__ */ state(void 0, stack));
						set(s, proxy(value));
						sources.set(prop, s);
					}
				} else {
					has = s.v !== UNINITIALIZED;
					var p = with_parent(() => proxy(value));
					set(s, p);
				}
				var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
				if (descriptor?.set) descriptor.set.call(receiver, value);
				if (!has) {
					if (is_proxied_array && typeof prop === "string") {
						var ls = sources.get("length");
						var n = Number(prop);
						if (Number.isInteger(n) && n >= ls.v) set(ls, n + 1);
					}
					increment(version);
				}
				return true;
			},
			ownKeys(target) {
				get$2(version);
				var own_keys = Reflect.ownKeys(target).filter((key) => {
					var source = sources.get(key);
					return source === void 0 || source.v !== UNINITIALIZED;
				});
				for (var [key, source] of sources) if (source.v !== UNINITIALIZED && !(key in target)) own_keys.push(key);
				return own_keys;
			},
			setPrototypeOf() {
				state_prototype_fixed();
			}
		});
	}
	/**
	* @param {any} value
	*/
	function get_proxied_value(value) {
		try {
			if (value !== null && typeof value === "object" && STATE_SYMBOL in value) return value[STATE_SYMBOL];
		} catch {}
		return value;
	}
	/**
	* @param {any} a
	* @param {any} b
	*/
	function is(a, b) {
		return Object.is(get_proxied_value(a), get_proxied_value(b));
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/operations.js
	/** @import { Effect, TemplateNode } from '#client' */
	/** @type {Window} */
	var $window;
	/** @type {boolean} */
	var is_firefox;
	/** @type {() => Node | null} */
	var first_child_getter;
	/** @type {() => Node | null} */
	var next_sibling_getter;
	/**
	* Initialize these lazily to avoid issues when using the runtime in a server context
	* where these globals are not available while avoiding a separate server entry point
	*/
	function init_operations() {
		if ($window !== void 0) return;
		$window = window;
		is_firefox = /Firefox/.test(navigator.userAgent);
		var element_prototype = Element.prototype;
		var node_prototype = Node.prototype;
		var text_prototype = Text.prototype;
		first_child_getter = get_descriptor(node_prototype, "firstChild").get;
		next_sibling_getter = get_descriptor(node_prototype, "nextSibling").get;
		if (is_extensible(element_prototype)) {
			/** @type {any} */ element_prototype[CLASS_CACHE] = void 0;
			/** @type {any} */ element_prototype[ATTRIBUTES_CACHE] = null;
			/** @type {any} */ element_prototype[STYLE_CACHE] = void 0;
			element_prototype.__e = void 0;
		}
		if (is_extensible(text_prototype))
 /** @type {any} */ text_prototype[TEXT_CACHE] = void 0;
	}
	/**
	* @param {string} value
	* @returns {Text}
	*/
	function create_text(value = "") {
		return document.createTextNode(value);
	}
	/**
	* @template {Node} N
	* @param {N} node
	*/
	/*@__NO_SIDE_EFFECTS__*/
	function get_first_child(node) {
		return first_child_getter.call(node);
	}
	/**
	* @template {Node} N
	* @param {N} node
	*/
	/*@__NO_SIDE_EFFECTS__*/
	function get_next_sibling(node) {
		return next_sibling_getter.call(node);
	}
	/**
	* Don't mark this as side-effect-free, hydration needs to walk all nodes
	* @template {Node} N
	* @param {N} node
	* @param {boolean} is_text
	* @returns {TemplateNode | null}
	*/
	function child(node, is_text) {
		if (!hydrating) return /* @__PURE__ */ get_first_child(node);
		var child = /* @__PURE__ */ get_first_child(hydrate_node);
		if (child === null) child = hydrate_node.appendChild(create_text());
		else if (is_text && child.nodeType !== 3) {
			var text = create_text();
			child?.before(text);
			set_hydrate_node(text);
			return text;
		}
		if (is_text) merge_text_nodes(child);
		set_hydrate_node(child);
		return child;
	}
	/**
	* Don't mark this as side-effect-free, hydration needs to walk all nodes
	* @param {TemplateNode} node
	* @param {boolean} [is_text]
	* @returns {TemplateNode | null}
	*/
	function first_child(node, is_text = false) {
		if (!hydrating) {
			var first = /* @__PURE__ */ get_first_child(node);
			if (first instanceof Comment && first.data === "") return /* @__PURE__ */ get_next_sibling(first);
			return first;
		}
		if (is_text) {
			if (hydrate_node?.nodeType !== 3) {
				var text = create_text();
				hydrate_node?.before(text);
				set_hydrate_node(text);
				return text;
			}
			merge_text_nodes(hydrate_node);
		}
		return hydrate_node;
	}
	/**
	* `child`, for the very common case of an element with exactly one child. Resetting the
	* hydration cursor is part of the same step, so the compiler doesn't have to emit a
	* separate `reset` call for every `<p>{text}</p>` in an app.
	* Don't mark this as side-effect-free, hydration needs to walk all nodes
	* @param {TemplateNode} node
	* @param {boolean} [is_text]
	* @returns {TemplateNode | null}
	*/
	function only_child(node, is_text = false) {
		if (!hydrating) return /* @__PURE__ */ get_first_child(node);
		var first = child(node, is_text);
		reset(node);
		return first;
	}
	/**
	* Don't mark this as side-effect-free, hydration needs to walk all nodes
	* @param {TemplateNode} node
	* @param {number} count
	* @param {boolean} is_text
	* @returns {TemplateNode | null}
	*/
	function sibling(node, count = 1, is_text = false) {
		let next_sibling = hydrating ? hydrate_node : node;
		var last_sibling;
		while (count--) {
			last_sibling = next_sibling;
			next_sibling = /* @__PURE__ */ get_next_sibling(next_sibling);
		}
		if (!hydrating) return next_sibling;
		if (is_text) {
			if (next_sibling?.nodeType !== 3) {
				var text = create_text();
				if (next_sibling === null) last_sibling?.after(text);
				else next_sibling.before(text);
				set_hydrate_node(text);
				return text;
			}
			merge_text_nodes(next_sibling);
		}
		set_hydrate_node(next_sibling);
		return next_sibling;
	}
	/**
	* @template {Node} N
	* @param {N} node
	* @returns {void}
	*/
	function clear_text_content(node) {
		node.textContent = "";
	}
	/**
	* Returns `true` if we're updating the current block, for example `condition` in
	* an `{#if condition}` block just changed. In this case, the branch should be
	* appended (or removed) at the same time as other updates within the
	* current `<svelte:boundary>`
	*/
	function should_defer_append() {
		if (!async_mode_flag) return false;
		if (eager_block_effects !== null) return false;
		return (active_effect.f & REACTION_RAN) !== 0;
	}
	/**
	* Branching here is intentional and load-bearing for perf. `createElement(tag)`
	* hits a fast path in Blink that `createElementNS(NAMESPACE_HTML, tag)` doesn't,
	* and passing an explicit `undefined` as the trailing options arg measurably
	* slows both APIs. Funnelling every case through a single `createElementNS(ns,
	* tag, options)` call would be smaller but slower on the HTML path.
	*
	* @template {keyof HTMLElementTagNameMap | string} T
	* @param {T} tag
	* @param {string} [namespace]
	* @param {string} [is]
	* @returns {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element}
	*/
	function create_element(tag, namespace, is) {
		if (namespace == null || namespace === "http://www.w3.org/1999/xhtml") return is ? document.createElement(tag, { is }) : document.createElement(tag);
		return is ? document.createElementNS(namespace, tag, { is }) : document.createElementNS(namespace, tag);
	}
	function create_fragment() {
		return document.createDocumentFragment();
	}
	/**
	* @param {string} data
	* @returns
	*/
	function create_comment(data = "") {
		return document.createComment(data);
	}
	/**
	* @param {Element} element
	* @param {string} key
	* @param {string} value
	* @returns
	*/
	function set_attribute$1(element, key, value = "") {
		if (key.startsWith("xlink:")) {
			element.setAttributeNS("http://www.w3.org/1999/xlink", key, value);
			return;
		}
		return element.setAttribute(key, value);
	}
	/**
	* Browsers split text nodes larger than 65536 bytes when parsing.
	* For hydration to succeed, we need to stitch them back together
	* @param {Text} text
	*/
	function merge_text_nodes(text) {
		if (text.nodeValue.length < 65536) return;
		let next = text.nextSibling;
		while (next !== null && next.nodeType === 3) {
			next.remove();
			/** @type {string} */ text.nodeValue += next.nodeValue;
			next = text.nextSibling;
		}
	}
	/**
	* @param {unknown} error
	*/
	function handle_error(error) {
		var effect = active_effect;
		if (effect === null) {
			/** @type {Derived} */ active_reaction.f |= ERROR_VALUE;
			return error;
		}
		if ((effect.f & 32768) === 0 && (effect.f & 4) === 0) throw error;
		invoke_error_boundary(error, effect);
	}
	/**
	* @param {unknown} error
	* @param {Effect | null} effect
	*/
	function invoke_error_boundary(error, effect) {
		if (effect !== null && (effect.f & 16384) !== 0) return;
		while (effect !== null) {
			if ((effect.f & 128) !== 0 && (effect.f & 33570816) === 0) {
				if ((effect.f & 32768) === 0) throw error;
				try {
					/** @type {Boundary} */ effect.b.error(error);
					return;
				} catch (e) {
					error = e;
				}
			}
			effect = effect.parent;
		}
		throw error;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/effects.js
	/** @import { Blocker, ComponentContext, ComponentContextLegacy, Derived, Effect, TemplateNode, TransitionManager } from '#client' */
	/**
	* @param {'$effect' | '$effect.pre' | '$inspect'} rune
	*/
	function validate_effect(rune) {
		if (active_effect === null) {
			if (active_reaction === null) effect_orphan(rune);
			effect_in_unowned_derived();
		}
		if (is_destroying_effect) effect_in_teardown(rune);
	}
	/**
	* @param {Effect} effect
	* @param {Effect} parent_effect
	*/
	function push_effect(effect, parent_effect) {
		var parent_last = parent_effect.last;
		if (parent_last === null) parent_effect.last = parent_effect.first = effect;
		else {
			parent_last.next = effect;
			effect.prev = parent_last;
			parent_effect.last = effect;
		}
	}
	/**
	* @param {number} type
	* @param {null | (() => void | (() => void))} fn
	* @returns {Effect}
	*/
	function create_effect(type, fn) {
		var parent = active_effect;
		if (parent !== null && (parent.f & 8192) !== 0) type |= INERT;
		/** @type {Effect} */
		var effect = {
			ctx: component_context,
			deps: null,
			nodes: null,
			f: type | DIRTY | 512,
			first: null,
			fn,
			last: null,
			next: null,
			parent,
			b: parent && parent.b,
			prev: null,
			teardown: null,
			wv: 0,
			ac: null
		};
		current_batch?.register_created_effect(effect);
		/** @type {Effect | null} */
		var e = effect;
		if ((type & 4) !== 0) {
			if (collected_effects !== null) collected_effects.push(effect);
			else Batch.ensure().schedule(effect);
		} else if (fn !== null) {
			try {
				update_effect(effect);
			} catch (e) {
				destroy_effect(effect);
				throw e;
			}
			if (e.deps === null && e.teardown === null && e.nodes === null && e.first === e.last && (e.f & 524288) === 0) {
				e = e.first;
				if ((type & 16) !== 0 && (type & 65536) !== 0 && e !== null) e.f |= EFFECT_TRANSPARENT;
			}
		}
		if (e !== null) {
			e.parent = parent;
			if (parent !== null) push_effect(e, parent);
			if (active_reaction !== null && (active_reaction.f & 2) !== 0 && (type & 64) === 0) {
				var derived = active_reaction;
				(derived.effects ??= []).push(e);
			}
		}
		return effect;
	}
	/**
	* Internal representation of `$effect.tracking()`
	* @returns {boolean}
	*/
	function effect_tracking() {
		return active_reaction !== null && !untracking;
	}
	/**
	* @param {() => void} fn
	*/
	function teardown(fn) {
		const effect = create_effect(8, null);
		set_signal_status(effect, CLEAN);
		effect.teardown = fn;
		return effect;
	}
	/**
	* Internal representation of `$effect(...)`
	* @param {() => void | (() => void)} fn
	*/
	function user_effect(fn) {
		validate_effect("$effect");
		var flags = active_effect.f;
		if (!active_reaction && (flags & 32) !== 0 && component_context !== null && !component_context.i) {
			var context = component_context;
			(context.e ??= []).push(fn);
		} else return create_user_effect(fn);
	}
	/**
	* @param {() => void | (() => void)} fn
	*/
	function create_user_effect(fn) {
		return create_effect(4 | USER_EFFECT, fn);
	}
	/**
	* Internal representation of `$effect.pre(...)`
	* @param {() => void | (() => void)} fn
	* @returns {Effect}
	*/
	function user_pre_effect(fn) {
		validate_effect("$effect.pre");
		return create_effect(8 | USER_EFFECT, fn);
	}
	/**
	* Internal representation of `$effect.root(...)`
	* @param {() => void | (() => void)} fn
	* @returns {() => void}
	*/
	function effect_root(fn) {
		Batch.ensure();
		const effect = create_effect(64 | EFFECT_PRESERVED, fn);
		return () => {
			destroy_effect(effect);
		};
	}
	/**
	* An effect root whose children can transition out
	* @param {() => void} fn
	* @returns {(options?: { outro?: boolean }) => Promise<void>}
	*/
	function component_root(fn) {
		Batch.ensure();
		const effect = create_effect(64 | EFFECT_PRESERVED, fn);
		return (options = {}) => {
			return new Promise((fulfil) => {
				if (options.outro) pause_effect(effect, () => {
					destroy_effect(effect);
					fulfil(void 0);
				});
				else {
					destroy_effect(effect);
					fulfil(void 0);
				}
			});
		};
	}
	/**
	* @param {() => void | (() => void)} fn
	* @returns {Effect}
	*/
	function effect(fn) {
		return create_effect(4, fn);
	}
	/**
	* @param {() => void | (() => void)} fn
	* @returns {Effect}
	*/
	function async_effect(fn) {
		return create_effect(ASYNC | EFFECT_PRESERVED, fn);
	}
	/**
	* @param {() => void | (() => void)} fn
	* @returns {Effect}
	*/
	function render_effect(fn, flags = 0) {
		return create_effect(8 | flags, fn);
	}
	/**
	* @param {(...expressions: any) => void | (() => void)} fn
	* @param {Array<() => any>} sync
	* @param {Array<() => Promise<any>>} async
	* @param {Blocker[]} blockers
	*/
	function template_effect(fn, sync = [], async = [], blockers = []) {
		flatten(blockers, sync, async, (values) => {
			create_effect(8, () => {
				fn(...values.map(get$2));
			});
		});
	}
	/**
	* @param {(() => void)} fn
	* @param {number} flags
	*/
	function block(fn, flags = 0) {
		return create_effect(16 | flags, fn);
	}
	/**
	* @param {(() => void)} fn
	* @param {number} flags
	*/
	function managed(fn, flags = 0) {
		return create_effect(MANAGED_EFFECT | flags, fn);
	}
	/**
	* @param {(() => void)} fn
	*/
	function branch(fn) {
		return create_effect(32 | EFFECT_PRESERVED, fn);
	}
	/**
	* @param {Effect} effect
	*/
	function execute_effect_teardown(effect) {
		var teardown = effect.teardown;
		if (teardown !== null) {
			const previously_destroying_effect = is_destroying_effect;
			const previous_reaction = active_reaction;
			set_is_destroying_effect(true);
			set_active_reaction(null);
			try {
				teardown.call(null);
			} catch (error) {
				invoke_error_boundary(error, effect.parent);
			} finally {
				set_is_destroying_effect(previously_destroying_effect);
				set_active_reaction(previous_reaction);
			}
		}
	}
	/**
	* @param {Effect} signal
	* @param {boolean} remove_dom
	* @returns {void}
	*/
	function destroy_effect_children(signal, remove_dom = false) {
		var effect = signal.first;
		signal.first = signal.last = null;
		while (effect !== null) {
			const controller = effect.ac;
			if (controller !== null) without_reactive_context(() => {
				controller.abort(STALE_REACTION);
			});
			var next = effect.next;
			if ((effect.f & 64) !== 0) effect.parent = null;
			else destroy_effect(effect, remove_dom);
			effect = next;
		}
	}
	/**
	* @param {Effect} signal
	* @returns {void}
	*/
	function destroy_block_effect_children(signal) {
		var effect = signal.first;
		while (effect !== null) {
			var next = effect.next;
			if ((effect.f & 32) === 0) destroy_effect(effect);
			effect = next;
		}
	}
	/**
	* @param {Effect} effect
	* @param {boolean} [remove_dom]
	* @returns {void}
	*/
	function destroy_effect(effect, remove_dom = true) {
		var removed = false;
		if ((remove_dom || (effect.f & 262144) !== 0) && effect.nodes !== null && effect.nodes.end !== null) {
			remove_effect_dom(effect.nodes.start, effect.nodes.end);
			removed = true;
		}
		effect.f |= DESTROYING;
		destroy_effect_children(effect, remove_dom && !removed);
		remove_reactions(effect, 0);
		var transitions = effect.nodes && effect.nodes.t;
		if (transitions !== null) for (const transition of transitions) transition.stop();
		execute_effect_teardown(effect);
		effect.f ^= DESTROYING;
		effect.f |= DESTROYED;
		var parent = effect.parent;
		if (parent !== null && parent.first !== null) unlink_effect(effect);
		effect.next = effect.prev = effect.teardown = effect.ctx = effect.deps = effect.fn = effect.nodes = effect.ac = effect.b = null;
	}
	/**
	*
	* @param {TemplateNode | null} node
	* @param {TemplateNode} end
	*/
	function remove_effect_dom(node, end) {
		while (node !== null) {
			/** @type {TemplateNode | null} */
			var next = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
			node.remove();
			node = next;
		}
	}
	/**
	* Detach an effect from the effect tree, freeing up memory and
	* reducing the amount of work that happens on subsequent traversals
	* @param {Effect} effect
	*/
	function unlink_effect(effect) {
		var parent = effect.parent;
		var prev = effect.prev;
		var next = effect.next;
		if (prev !== null) prev.next = next;
		if (next !== null) next.prev = prev;
		if (parent !== null) {
			if (parent.first === effect) parent.first = next;
			if (parent.last === effect) parent.last = prev;
		}
	}
	/**
	* When a block effect is removed, we don't immediately destroy it or yank it
	* out of the DOM, because it might have transitions. Instead, we 'pause' it.
	* It stays around (in memory, and in the DOM) until outro transitions have
	* completed, and if the state change is reversed then we _resume_ it.
	* A paused effect does not update, and the DOM subtree becomes inert.
	* @param {Effect} effect
	* @param {() => void} [callback]
	* @param {boolean} [destroy]
	*/
	function pause_effect(effect, callback, destroy = true) {
		/** @type {TransitionManager[]} */
		var transitions = [];
		effect.f |= 256;
		pause_children(effect, transitions, true);
		var fn = () => {
			if (destroy) destroy_effect(effect);
			if (callback) callback();
		};
		var remaining = transitions.length;
		if (remaining > 0) {
			var check = () => --remaining || fn();
			for (var transition of transitions) transition.out(check);
		} else fn();
	}
	/**
	* @param {Effect} effect
	* @param {TransitionManager[]} transitions
	* @param {boolean} local
	*/
	function pause_children(effect, transitions, local) {
		if ((effect.f & 8192) !== 0) return;
		effect.f ^= INERT;
		var t = effect.nodes && effect.nodes.t;
		if (t !== null) {
			for (const transition of t) if (transition.is_global || local) transitions.push(transition);
		}
		var child = effect.first;
		while (child !== null) {
			var sibling = child.next;
			if ((child.f & 64) === 0) {
				var transparent = (child.f & 65536) !== 0 || (child.f & 32) !== 0 && (effect.f & 16) !== 0;
				pause_children(child, transitions, transparent ? local : false);
			}
			child = sibling;
		}
	}
	/**
	* The opposite of `pause_effect`. We call this if (for example)
	* `x` becomes falsy then truthy: `{#if x}...{/if}`
	* @param {Effect} effect
	*/
	function resume_effect(effect) {
		effect.f &= -257;
		resume_children(effect, true);
	}
	/**
	* @param {Effect} effect
	* @param {boolean} local
	*/
	function resume_children(effect, local) {
		if ((effect.f & 256) !== 0) return;
		if ((effect.f & 8192) === 0) return;
		effect.f ^= INERT;
		if ((effect.f & 1024) === 0) {
			set_signal_status(effect, DIRTY);
			Batch.ensure().schedule(effect);
		}
		var child = effect.first;
		while (child !== null) {
			var sibling = child.next;
			var transparent = (child.f & 65536) !== 0 || (child.f & 32) !== 0;
			resume_children(child, transparent ? local : false);
			child = sibling;
		}
		var t = effect.nodes && effect.nodes.t;
		if (t !== null) {
			for (const transition of t) if (transition.is_global || local) transition.in();
		}
	}
	/**
	* @param {Effect} effect
	* @param {DocumentFragment} fragment
	*/
	function move_effect(effect, fragment) {
		if (!effect.nodes) return;
		/** @type {TemplateNode | null} */
		var node = effect.nodes.start;
		var end = effect.nodes.end;
		while (node !== null) {
			/** @type {TemplateNode | null} */
			var next = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
			fragment.append(node);
			node = next;
		}
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/legacy.js
	/**
	* @type {Set<Value> | null}
	* @deprecated
	*/
	var captured_signals = null;
	//#endregion
	//#region node_modules/svelte/src/internal/client/runtime.js
	/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */
	/**
	* True if updating in an effect context that is reactive (i.e. not branch/root effects)
	*/
	var is_updating_effect = false;
	var is_destroying_effect = false;
	/** @param {boolean} value */
	function set_is_destroying_effect(value) {
		is_destroying_effect = value;
	}
	/** @type {null | Reaction} */
	var active_reaction = null;
	var untracking = false;
	/** @param {null | Reaction} reaction */
	function set_active_reaction(reaction) {
		active_reaction = reaction;
	}
	/** @type {null | Effect} */
	var active_effect = null;
	/** @param {null | Effect} effect */
	function set_active_effect(effect) {
		active_effect = effect;
	}
	/**
	* When sources are created within a reaction, reading and writing
	* them within that reaction should not cause a re-run
	* @type {null | Set<Source>}
	*/
	var current_sources = null;
	/** @param {Value} value */
	function push_reaction_value(value) {
		if (active_reaction !== null && (!async_mode_flag && (active_reaction.f & 2097152) !== 0 || (active_reaction.f & 2) !== 0)) (current_sources ??= /* @__PURE__ */ new Set()).add(value);
	}
	/**
	* The dependencies of the reaction that is currently being executed. In many cases,
	* the dependencies are unchanged between runs, and so this will be `null` unless
	* and until a new dependency is accessed — we track this via `skipped_deps`
	* @type {null | Value[]}
	*/
	var new_deps = null;
	var skipped_deps = 0;
	/**
	* Tracks writes that the effect it's executed in doesn't listen to yet,
	* so that the dependency can be added to the effect later on if it then reads it
	* @type {null | Source[]}
	*/
	var untracked_writes = null;
	/** @param {null | Source[]} value */
	function set_untracked_writes(value) {
		untracked_writes = value;
	}
	/**
	* @type {number} Used by sources and deriveds for handling updates.
	* Version starts from 1 so that unowned deriveds differentiate between a created effect and a run one for tracing
	**/
	var write_version = 1;
	/** @type {number} Used to version each read of a source of derived to avoid duplicating dependencies inside a reaction */
	var read_version = 0;
	var update_version = read_version;
	/** @param {number} value */
	function set_update_version(value) {
		update_version = value;
	}
	function increment_write_version() {
		return ++write_version;
	}
	/**
	* Determines whether a derived or effect is dirty.
	* If it is MAYBE_DIRTY, will set the status to CLEAN
	* @param {Reaction} reaction
	* @returns {boolean}
	*/
	function is_dirty(reaction) {
		var flags = reaction.f;
		if ((flags & 2048) !== 0) return true;
		if ((flags & 4096) !== 0) {
			var dependencies = reaction.deps;
			var length = dependencies.length;
			for (var i = 0; i < length; i++) {
				var dependency = dependencies[i];
				if (is_dirty(dependency)) update_derived(dependency);
				if (dependency.wv > reaction.wv) return true;
			}
			if ((flags & 512) !== 0 && batch_values === null) set_signal_status(reaction, CLEAN);
		}
		return false;
	}
	/**
	* @param {Value} signal
	* @param {Effect} effect
	* @param {boolean} [root]
	*/
	function schedule_possible_effect_self_invalidation(signal, effect, root = true) {
		var reactions = signal.reactions;
		if (reactions === null) return;
		if (!async_mode_flag && current_sources !== null && current_sources.has(signal)) return;
		for (var i = 0; i < reactions.length; i++) {
			var reaction = reactions[i];
			if ((reaction.f & 2) !== 0) schedule_possible_effect_self_invalidation(reaction, effect, false);
			else if (effect === reaction) {
				if (root) set_signal_status(reaction, DIRTY);
				else if ((reaction.f & 1024) !== 0) set_signal_status(reaction, MAYBE_DIRTY);
				schedule_effect(reaction);
			}
		}
	}
	/** @param {Reaction} reaction */
	function update_reaction(reaction) {
		var previous_deps = new_deps;
		var previous_skipped_deps = skipped_deps;
		var previous_untracked_writes = untracked_writes;
		var previous_reaction = active_reaction;
		var previous_sources = current_sources;
		var previous_component_context = component_context;
		var previous_untracking = untracking;
		var previous_update_version = update_version;
		var flags = reaction.f;
		new_deps = null;
		skipped_deps = 0;
		untracked_writes = null;
		active_reaction = (flags & 96) === 0 ? reaction : null;
		current_sources = null;
		set_component_context(reaction.ctx);
		untracking = false;
		update_version = ++read_version;
		if (reaction.ac !== null) {
			without_reactive_context(() => {
				/** @type {AbortController} */ reaction.ac.abort(STALE_REACTION);
			});
			reaction.ac = null;
		}
		try {
			reaction.f |= REACTION_IS_UPDATING;
			var fn = reaction.fn;
			var result = fn();
			reaction.f |= REACTION_RAN;
			var deps = update_dependencies(reaction);
			if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & 6146) === 0) for (var i = 0; i < untracked_writes.length; i++) schedule_possible_effect_self_invalidation(untracked_writes[i], reaction);
			if (previous_reaction !== null && previous_reaction !== reaction) {
				read_version++;
				if (previous_reaction.deps !== null) for (let i = 0; i < previous_skipped_deps; i += 1) previous_reaction.deps[i].rv = read_version;
				if (previous_deps !== null) for (const dep of previous_deps) dep.rv = read_version;
				if (untracked_writes !== null) {
					if (previous_untracked_writes === null) previous_untracked_writes = untracked_writes;
					else previous_untracked_writes.push(...untracked_writes);
				}
			}
			if ((reaction.f & 8388608) !== 0) reaction.f ^= ERROR_VALUE;
			return result;
		} catch (error) {
			update_dependencies(reaction);
			return handle_error(error);
		} finally {
			reaction.f ^= REACTION_IS_UPDATING;
			new_deps = previous_deps;
			skipped_deps = previous_skipped_deps;
			untracked_writes = previous_untracked_writes;
			active_reaction = previous_reaction;
			current_sources = previous_sources;
			set_component_context(previous_component_context);
			untracking = previous_untracking;
			update_version = previous_update_version;
		}
	}
	/**
	* @param {Reaction} reaction
	*/
	function update_dependencies(reaction) {
		var deps = reaction.deps;
		var is_fork = current_batch?.is_fork;
		if (new_deps !== null) {
			var i;
			if (!is_fork) remove_reactions(reaction, skipped_deps);
			if (deps !== null && skipped_deps > 0) {
				deps.length = skipped_deps + new_deps.length;
				for (i = 0; i < new_deps.length; i++) deps[skipped_deps + i] = new_deps[i];
			} else reaction.deps = deps = new_deps;
			if (effect_tracking() && (reaction.f & 512) !== 0) for (i = skipped_deps; i < deps.length; i++) (deps[i].reactions ??= []).push(reaction);
		} else if (!is_fork && deps !== null && skipped_deps < deps.length) {
			remove_reactions(reaction, skipped_deps);
			deps.length = skipped_deps;
		}
		return deps;
	}
	/**
	* @template V
	* @param {Reaction} signal
	* @param {Value<V>} dependency
	* @returns {void}
	*/
	function remove_reaction(signal, dependency) {
		let reactions = dependency.reactions;
		if (reactions !== null) {
			var index = index_of.call(reactions, signal);
			if (index !== -1) {
				var new_length = reactions.length - 1;
				if (new_length === 0) reactions = dependency.reactions = null;
				else {
					reactions[index] = reactions[new_length];
					reactions.pop();
				}
			}
		}
		if (reactions === null && (dependency.f & 2) !== 0 && (new_deps === null || !includes.call(new_deps, dependency))) {
			var derived = dependency;
			if ((derived.f & 512) !== 0) derived.f ^= 512;
			if (derived.v !== UNINITIALIZED) update_derived_status(derived);
			if (derived.ac !== null) without_reactive_context(() => {
				/** @type {AbortController} */ derived.ac.abort(STALE_REACTION);
				derived.ac = null;
				set_signal_status(derived, DIRTY);
			});
			freeze_derived_effects(derived);
			remove_reactions(derived, 0);
		}
	}
	/**
	* @param {Reaction} signal
	* @param {number} start_index
	* @returns {void}
	*/
	function remove_reactions(signal, start_index) {
		var dependencies = signal.deps;
		if (dependencies === null) return;
		for (var i = start_index; i < dependencies.length; i++) remove_reaction(signal, dependencies[i]);
	}
	/**
	* @param {Effect} effect
	* @returns {void}
	*/
	function update_effect(effect) {
		var flags = effect.f;
		if ((flags & 16384) !== 0) return;
		set_signal_status(effect, CLEAN);
		var previous_effect = active_effect;
		var was_updating_effect = is_updating_effect;
		active_effect = effect;
		is_updating_effect = (flags & 96) === 0;
		try {
			if ((flags & 16777232) !== 0) destroy_block_effect_children(effect);
			else destroy_effect_children(effect);
			execute_effect_teardown(effect);
			var teardown = update_reaction(effect);
			effect.teardown = typeof teardown === "function" ? teardown : null;
			effect.wv = write_version;
		} finally {
			is_updating_effect = was_updating_effect;
			active_effect = previous_effect;
		}
	}
	/**
	* Returns a promise that resolves once any pending state changes have been applied.
	* @returns {Promise<void>}
	*/
	async function tick() {
		if (async_mode_flag) return new Promise((f) => {
			requestAnimationFrame(() => f());
			setTimeout(() => f());
		});
		await Promise.resolve();
		flushSync();
	}
	/**
	* @template V
	* @param {Value<V>} signal
	* @returns {V}
	*/
	function get$2(signal) {
		var is_derived = (signal.f & 2) !== 0;
		captured_signals?.add(signal);
		if (active_reaction !== null && !untracking) {
			if (!(active_effect !== null && (active_effect.f & 16384) !== 0) && (current_sources === null || !current_sources.has(signal))) {
				var deps = active_reaction.deps;
				if ((active_reaction.f & 2097152) !== 0) {
					if (signal.rv < read_version) {
						signal.rv = read_version;
						if (new_deps === null && deps !== null && deps[skipped_deps] === signal) skipped_deps++;
						else if (new_deps === null) new_deps = [signal];
						else new_deps.push(signal);
					}
				} else {
					active_reaction.deps ??= [];
					if (!includes.call(active_reaction.deps, signal)) active_reaction.deps.push(signal);
					var reactions = signal.reactions;
					if (reactions === null) signal.reactions = [active_reaction];
					else if (!includes.call(reactions, active_reaction)) reactions.push(active_reaction);
				}
			}
		}
		if (is_destroying_effect && old_values.has(signal)) return old_values.get(signal);
		if (is_derived) {
			var derived = signal;
			if (is_destroying_effect) {
				var value = derived.v;
				if ((derived.f & 1024) === 0 && derived.reactions !== null || depends_on_old_values(derived)) value = execute_derived(derived);
				old_values.set(derived, value);
				return value;
			}
			var should_connect = (derived.f & 512) === 0 && !untracking && active_reaction !== null && (is_updating_effect || (active_reaction.f & 512) !== 0);
			var is_new = (derived.f & REACTION_RAN) === 0;
			if (is_dirty(derived)) {
				if (should_connect) derived.f |= 512;
				update_derived(derived);
			}
			if (should_connect && !is_new) {
				unfreeze_derived_effects(derived);
				reconnect(derived);
			}
		}
		if (batch_values?.has(signal)) return batch_values.get(signal);
		if ((signal.f & 8388608) !== 0) throw signal.v;
		return signal.v;
	}
	/**
	* (Re)connect a disconnected derived, so that it is notified
	* of changes in `mark_reactions`
	* @param {Derived} derived
	*/
	function reconnect(derived) {
		derived.f |= 512;
		if (derived.deps === null) return;
		for (const dep of derived.deps) {
			(dep.reactions ??= []).push(derived);
			if ((dep.f & 2) !== 0 && (dep.f & 512) === 0) {
				unfreeze_derived_effects(dep);
				reconnect(dep);
			}
		}
	}
	/** @param {Derived} derived */
	function depends_on_old_values(derived) {
		if (derived.v === UNINITIALIZED) return true;
		if (derived.deps === null) return false;
		for (const dep of derived.deps) {
			if (old_values.has(dep)) return true;
			if ((dep.f & 2) !== 0 && depends_on_old_values(dep)) return true;
		}
		return false;
	}
	/**
	* When used inside a [`$derived`](https://svelte.dev/docs/svelte/$derived) or [`$effect`](https://svelte.dev/docs/svelte/$effect),
	* any state read inside `fn` will not be treated as a dependency.
	*
	* ```ts
	* $effect(() => {
	*   // this will run when `data` changes, but not when `time` changes
	*   save(data, {
	*     timestamp: untrack(() => time)
	*   });
	* });
	* ```
	* @template T
	* @param {() => T} fn
	* @returns {T}
	*/
	function untrack(fn) {
		var previous_untracking = untracking;
		try {
			untracking = true;
			return fn();
		} finally {
			untracking = previous_untracking;
		}
	}
	//#endregion
	//#region node_modules/svelte/src/attachments/index.js
	/**
	* Creates an object key that will be recognised as an attachment when the object is spread onto an element,
	* as a programmatic alternative to using `{@attach ...}`. This can be useful for library authors, though
	* is generally not needed when building an app.
	*
	* ```svelte
	* <script>
	* 	import { createAttachmentKey } from 'svelte/attachments';
	*
	* 	const props = {
	* 		class: 'cool',
	* 		onclick: () => alert('clicked'),
	* 		[createAttachmentKey()]: (node) => {
	* 			node.textContent = 'attached!';
	* 		}
	* 	};
	* <\/script>
	*
	* <button {...props}>click me</button>
	* ```
	* @since 5.29
	*/
	function createAttachmentKey() {
		return Symbol(ATTACHMENT_KEY);
	}
	//#endregion
	//#region node_modules/svelte/src/utils.js
	/**
	* @param {string} name
	*/
	function is_capture_event(name) {
		return name.endsWith("capture") && name !== "gotpointercapture" && name !== "lostpointercapture";
	}
	/** List of Element events that will be delegated */
	var DELEGATED_EVENTS = [
		"beforeinput",
		"click",
		"change",
		"dblclick",
		"contextmenu",
		"focusin",
		"focusout",
		"input",
		"keydown",
		"keyup",
		"mousedown",
		"mousemove",
		"mouseout",
		"mouseover",
		"mouseup",
		"pointerdown",
		"pointermove",
		"pointerout",
		"pointerover",
		"pointerup",
		"touchend",
		"touchmove",
		"touchstart"
	];
	/**
	* Returns `true` if `event_name` is a delegated event
	* @param {string} event_name
	*/
	function can_delegate_event(event_name) {
		return DELEGATED_EVENTS.includes(event_name);
	}
	/**
	* Attributes that are boolean, i.e. they are present or not present.
	*/
	var DOM_BOOLEAN_ATTRIBUTES = [
		"allowfullscreen",
		"async",
		"autofocus",
		"autoplay",
		"checked",
		"controls",
		"default",
		"disabled",
		"formnovalidate",
		"indeterminate",
		"inert",
		"ismap",
		"loop",
		"multiple",
		"muted",
		"nomodule",
		"novalidate",
		"open",
		"playsinline",
		"readonly",
		"required",
		"reversed",
		"seamless",
		"selected",
		"webkitdirectory",
		"defer",
		"disablepictureinpicture",
		"disableremoteplayback"
	];
	/**
	* @type {Record<string, string>}
	* List of attribute names that should be aliased to their property names
	* because they behave differently between setting them as an attribute and
	* setting them as a property.
	*/
	var ATTRIBUTE_ALIASES = {
		formnovalidate: "formNoValidate",
		ismap: "isMap",
		nomodule: "noModule",
		playsinline: "playsInline",
		readonly: "readOnly",
		defaultvalue: "defaultValue",
		defaultchecked: "defaultChecked",
		srcobject: "srcObject",
		novalidate: "noValidate",
		allowfullscreen: "allowFullscreen",
		disablepictureinpicture: "disablePictureInPicture",
		disableremoteplayback: "disableRemotePlayback"
	};
	/**
	* @param {string} name
	*/
	function normalize_attribute(name) {
		name = name.toLowerCase();
		return ATTRIBUTE_ALIASES[name] ?? name;
	}
	[...DOM_BOOLEAN_ATTRIBUTES];
	/**
	* Subset of delegated events which should be passive by default.
	* These two are already passive via browser defaults on window, document and body.
	* But since
	* - we're delegating them
	* - they happen often
	* - they apply to mobile which is generally less performant
	* we're marking them as passive by default for other elements, too.
	*/
	var PASSIVE_EVENTS = ["touchstart", "touchmove"];
	/**
	* Returns `true` if `name` is a passive event
	* @param {string} name
	*/
	function is_passive_event(name) {
		return PASSIVE_EVENTS.includes(name);
	}
	/** List of elements that require raw contents and should not have SSR comments put in them */
	var RAW_TEXT_ELEMENTS = [
		"textarea",
		"script",
		"style",
		"title"
	];
	/** @param {string} name */
	function is_raw_text_element(name) {
		return RAW_TEXT_ELEMENTS.includes(name);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/events.js
	/**
	* Used on elements, as a map of event type -> event handler,
	* and on events themselves to track which element handled an event
	*/
	var event_symbol = Symbol("events");
	/** @type {Set<string>} */
	var all_registered_events = /* @__PURE__ */ new Set();
	/** @type {Set<(events: Array<string>) => void>} */
	var root_event_handles = /* @__PURE__ */ new Set();
	/**
	* @param {string} event_name
	* @param {EventTarget} dom
	* @param {EventListener} [handler]
	* @param {AddEventListenerOptions} [options]
	*/
	function create_event(event_name, dom, handler, options = {}) {
		/**
		* @this {EventTarget}
		*/
		function target_handler(event) {
			if (!options.capture) handle_event_propagation.call(dom, event);
			if (!event.cancelBubble) return without_reactive_context(() => {
				return handler?.call(this, event);
			});
		}
		if (event_name.startsWith("pointer") || event_name.startsWith("touch") || event_name === "wheel") {
			target_handler.__removed = false;
			queue_micro_task(() => {
				if (!target_handler.__removed) dom.addEventListener(event_name, target_handler, options);
			});
		} else dom.addEventListener(event_name, target_handler, options);
		return target_handler;
	}
	/**
	* Attaches an event handler to an element and returns a function that removes the handler. Using this
	* rather than `addEventListener` will preserve the correct order relative to handlers added declaratively
	* (with attributes like `onclick`), which use event delegation for performance reasons
	*
	* @param {EventTarget} element
	* @param {string} type
	* @param {EventListener} handler
	* @param {AddEventListenerOptions} [options]
	*/
	function on(element, type, handler, options = {}) {
		var target_handler = create_event(type, element, handler, options);
		return () => {
			target_handler.__removed = true;
			element.removeEventListener(type, target_handler, options);
		};
	}
	/**
	* @param {string} event_name
	* @param {Element} dom
	* @param {EventListener} [handler]
	* @param {boolean} [capture]
	* @param {boolean} [passive]
	* @returns {void}
	*/
	function event(event_name, dom, handler, capture, passive) {
		var options = {
			capture,
			passive
		};
		var target_handler = create_event(event_name, dom, handler, options);
		if (dom === document.body || dom === window || dom === document || dom instanceof HTMLMediaElement) teardown(() => {
			target_handler.__removed = true;
			dom.removeEventListener(event_name, target_handler, options);
		});
	}
	/**
	* @param {string} event_name
	* @param {Element} element
	* @param {EventListener} [handler]
	* @returns {void}
	*/
	function delegated(event_name, element, handler) {
		(element[event_symbol] ??= {})[event_name] = handler;
	}
	/**
	* @param {Array<string>} events
	* @returns {void}
	*/
	function delegate(events) {
		for (var i = 0; i < events.length; i++) all_registered_events.add(events[i]);
		for (var fn of root_event_handles) fn(events);
	}
	var last_propagated_event = null;
	var last_propagated_event_clear_scheduled = false;
	/**
	* @this {EventTarget}
	* @param {Event} event
	* @returns {void}
	*/
	function handle_event_propagation(event) {
		var handler_element = this;
		var owner_document = handler_element.ownerDocument;
		var event_name = event.type;
		var path = event.composedPath?.() || [];
		var current_target = path[0] || event.target;
		last_propagated_event = event;
		if (!last_propagated_event_clear_scheduled) {
			last_propagated_event_clear_scheduled = true;
			setTimeout(() => {
				last_propagated_event_clear_scheduled = false;
				last_propagated_event = null;
			});
		}
		var path_idx = 0;
		var handled_at = last_propagated_event === event && event[event_symbol];
		if (handled_at) {
			var at_idx = path.indexOf(handled_at);
			if (at_idx !== -1 && (handler_element === document || handler_element === window)) {
				event[event_symbol] = handler_element;
				return;
			}
			var handler_idx = path.indexOf(handler_element);
			if (handler_idx === -1) return;
			if (at_idx <= handler_idx) path_idx = at_idx;
		}
		current_target = path[path_idx] || event.target;
		if (current_target === handler_element) return;
		define_property(event, "currentTarget", {
			configurable: true,
			get() {
				return current_target || owner_document;
			}
		});
		var previous_reaction = active_reaction;
		var previous_effect = active_effect;
		set_active_reaction(null);
		set_active_effect(null);
		try {
			/**
			* @type {unknown}
			*/
			var throw_error;
			/**
			* @type {unknown[]}
			*/
			var other_errors = [];
			while (current_target !== null) {
				if (current_target === handler_element) break;
				try {
					var delegated = current_target[event_symbol]?.[event_name];
					if (delegated != null && (!current_target.disabled || event.target === current_target)) delegated.call(current_target, event);
				} catch (error) {
					if (throw_error) other_errors.push(error);
					else throw_error = error;
				}
				if (event.cancelBubble) break;
				path_idx++;
				current_target = path_idx < path.length ? path[path_idx] : null;
			}
			if (throw_error) {
				for (let error of other_errors) queueMicrotask(() => {
					throw error;
				});
				throw throw_error;
			}
		} finally {
			event[event_symbol] = handler_element;
			delete event.currentTarget;
			set_active_reaction(previous_reaction);
			set_active_effect(previous_effect);
		}
	}
	globalThis?.window?.trustedTypes;
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/template.js
	/** @import { Effect, EffectNodes, TemplateNode } from '#client' */
	/** @import { TemplateStructure } from './types' */
	var TEMPLATE_TAG = IS_XHTML ? "template" : "TEMPLATE";
	/**
	* @param {TemplateNode} start
	* @param {TemplateNode | null} end
	*/
	function assign_nodes(start, end) {
		var effect = active_effect;
		if (effect.nodes === null) effect.nodes = {
			start,
			end,
			a: null,
			t: null
		};
	}
	/**
	* @param {TemplateStructure[]} structure
	* @param {typeof NAMESPACE_SVG | typeof NAMESPACE_MATHML | undefined} [ns]
	*/
	function fragment_from_tree(structure, ns) {
		var fragment = create_fragment();
		for (var item of structure) {
			if (typeof item === "string") {
				fragment.append(create_text(item));
				continue;
			}
			if (item === void 0 || item[0][0] === "/") {
				fragment.append(create_comment(item ? item[0].slice(3) : ""));
				continue;
			}
			const [name, attributes, ...children] = item;
			const namespace = name === "svg" ? NAMESPACE_SVG : name === "math" ? NAMESPACE_MATHML : ns;
			var element = create_element(name, namespace, attributes?.is);
			for (var key in attributes) set_attribute$1(element, key, attributes[key]);
			if (children.length > 0) (element.nodeName === TEMPLATE_TAG ? element.content : element).append(fragment_from_tree(children, element.nodeName === "foreignObject" ? void 0 : namespace));
			fragment.append(element);
		}
		return fragment;
	}
	/**
	* @param {TemplateStructure[]} structure
	* @param {number} flags
	* @returns {() => Node | Node[]}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function from_tree(structure, flags) {
		var is_fragment = (flags & 1) !== 0;
		var use_import_node = (flags & 2) !== 0;
		/** @type {Node} */
		var node;
		return () => {
			if (hydrating) {
				assign_nodes(hydrate_node, null);
				return hydrate_node;
			}
			if (node === void 0) {
				node = fragment_from_tree(structure, (flags & 4) !== 0 ? NAMESPACE_SVG : (flags & 8) !== 0 ? NAMESPACE_MATHML : void 0);
				if (!is_fragment) node = /* @__PURE__ */ get_first_child(node);
			}
			var clone = use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true);
			if (is_fragment) {
				var start = /* @__PURE__ */ get_first_child(clone);
				var end = clone.lastChild;
				assign_nodes(start, end);
			} else assign_nodes(clone, clone);
			return clone;
		};
	}
	/**
	* Don't mark this as side-effect-free, hydration needs to walk all nodes
	* @param {any} value
	*/
	function text(value = "") {
		if (!hydrating) {
			var t = create_text(value + "");
			assign_nodes(t, t);
			return t;
		}
		var node = hydrate_node;
		if (node.nodeType !== 3) {
			node.before(node = create_text());
			set_hydrate_node(node);
		} else merge_text_nodes(node);
		assign_nodes(node, node);
		return node;
	}
	/**
	* @returns {TemplateNode | DocumentFragment}
	*/
	function comment() {
		if (hydrating) {
			assign_nodes(hydrate_node, null);
			return hydrate_node;
		}
		var frag = document.createDocumentFragment();
		var start = document.createComment("");
		var anchor = create_text();
		frag.append(start, anchor);
		assign_nodes(start, anchor);
		return frag;
	}
	/**
	* Assign the created (or in hydration mode, traversed) dom elements to the current block
	* and insert the elements into the dom (in client mode).
	* @param {Text | Comment | Element} anchor
	* @param {DocumentFragment | Element} dom
	*/
	function append(anchor, dom) {
		if (hydrating) {
			var effect = active_effect;
			if ((effect.f & 32768) === 0 || effect.nodes.end === null) effect.nodes.end = hydrate_node;
			hydrate_next();
			return;
		}
		if (anchor === null) return;
		anchor.before(dom);
	}
	/**
	* Create (or hydrate) an unique UID for the component instance.
	*/
	function props_id() {
		if (hydrating && hydrate_node && hydrate_node.nodeType === 8 && hydrate_node.textContent?.startsWith(`$`)) {
			const id = hydrate_node.textContent.substring(1);
			hydrate_next();
			return id;
		}
		(window.__svelte ??= {}).uid ??= 1;
		return `c${window.__svelte.uid++}`;
	}
	//#endregion
	//#region node_modules/svelte/src/reactivity/create-subscriber.js
	/**
	* Returns a `subscribe` function that integrates external event-based systems with Svelte's reactivity.
	* It's particularly useful for integrating with web APIs like `MediaQuery`, `IntersectionObserver`, or `WebSocket`.
	*
	* If `subscribe` is called inside an effect (including indirectly, for example inside a getter),
	* the `start` callback will be called with an `update` function. Whenever `update` is called, the effect re-runs.
	*
	* If `start` returns a cleanup function, it will be called when the effect is destroyed.
	*
	* If `subscribe` is called in multiple effects, `start` will only be called once as long as the effects
	* are active, and the returned teardown function will only be called when all effects are destroyed.
	*
	* It's best understood with an example. Here's an implementation of [`MediaQuery`](https://svelte.dev/docs/svelte/svelte-reactivity#MediaQuery):
	*
	* ```js
	* import { createSubscriber } from 'svelte/reactivity';
	* import { on } from 'svelte/events';
	*
	* export class MediaQuery {
	* 	#query;
	* 	#subscribe;
	*
	* 	constructor(query) {
	* 		this.#query = window.matchMedia(`(${query})`);
	*
	* 		this.#subscribe = createSubscriber((update) => {
	* 			// when the `change` event occurs, re-run any effects that read `this.current`
	* 			const off = on(this.#query, 'change', update);
	*
	* 			// stop listening when all the effects are destroyed
	* 			return () => off();
	* 		});
	* 	}
	*
	* 	get current() {
	* 		// This makes the getter reactive, if read in an effect
	* 		this.#subscribe();
	*
	* 		// Return the current state of the query, whether or not we're in an effect
	* 		return this.#query.matches;
	* 	}
	* }
	* ```
	* @param {(update: () => void) => (() => void) | void} start
	* @since 5.7.0
	*/
	function createSubscriber(start) {
		let subscribers = 0;
		let version = source(0);
		/** @type {(() => void) | void} */
		let stop;
		return () => {
			if (effect_tracking()) {
				get$2(version);
				render_effect(() => {
					if (subscribers === 0) stop = untrack(() => start(() => increment(version)));
					subscribers += 1;
					return () => {
						queue_micro_task(() => {
							subscribers -= 1;
							if (subscribers === 0) {
								stop?.();
								stop = void 0;
								increment(version);
							}
						});
					};
				});
			}
		};
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/boundary.js
	/** @import { Effect, Source, TemplateNode, } from '#client' */
	/**
	* @typedef {{
	* 	 onerror?: ((error: unknown, reset: () => void) => void) | null;
	*   failed?: ((anchor: Node, error: () => unknown, reset: () => () => void) => void) | null;
	*   pending?: ((anchor: Node) => void) | null;
	* }} BoundaryProps
	*/
	var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED;
	/**
	* @param {TemplateNode} node
	* @param {BoundaryProps} props
	* @param {((anchor: Node) => void)} children
	* @param {((error: unknown) => unknown) | undefined} [transform_error]
	* @returns {void}
	*/
	function boundary(node, props, children, transform_error) {
		new Boundary(node, props, children, transform_error);
	}
	var Boundary = class {
		/** @type {Boundary | null} */
		parent;
		is_pending = false;
		/**
		* API-level transformError transform function. Transforms errors before they reach the `failed` snippet.
		* Inherited from parent boundary, or defaults to identity.
		* @type {(error: unknown) => unknown}
		*/
		transform_error;
		/** @type {TemplateNode} */
		#anchor;
		/** @type {TemplateNode | null} */
		#hydrate_open = hydrating ? hydrate_node : null;
		/** @type {BoundaryProps} */
		#props;
		/** @type {((anchor: Node) => void)} */
		#children;
		/** @type {Effect} */
		#effect;
		/** @type {Effect | null} */
		#main_effect = null;
		/** @type {Effect | null} */
		#pending_effect = null;
		/** @type {Effect | null} */
		#failed_effect = null;
		/** @type {DocumentFragment | null} */
		#offscreen_fragment = null;
		#local_pending_count = 0;
		#pending_count = 0;
		#pending_count_update_queued = false;
		/** @type {Set<Effect>} */
		#dirty_effects = /* @__PURE__ */ new Set();
		/** @type {Set<Effect>} */
		#maybe_dirty_effects = /* @__PURE__ */ new Set();
		/**
		* A source containing the number of pending async deriveds/expressions.
		* Only created if `$effect.pending()` is used inside the boundary,
		* otherwise updating the source results in needless `Batch.ensure()`
		* calls followed by no-op flushes
		* @type {Source<number> | null}
		*/
		#effect_pending = null;
		#effect_pending_subscriber = createSubscriber(() => {
			this.#effect_pending = source(this.#local_pending_count);
			return () => {
				this.#effect_pending = null;
			};
		});
		/**
		* @param {TemplateNode} node
		* @param {BoundaryProps} props
		* @param {((anchor: Node) => void)} children
		* @param {((error: unknown) => unknown) | undefined} [transform_error]
		*/
		constructor(node, props, children, transform_error) {
			this.#anchor = node;
			this.#props = props;
			this.#children = (anchor) => {
				var effect = active_effect;
				effect.b = this;
				effect.f |= 128;
				children(anchor);
			};
			this.parent = active_effect.b;
			this.transform_error = transform_error ?? this.parent?.transform_error ?? ((e) => e);
			this.#effect = block(() => {
				if (hydrating) {
					const comment = this.#hydrate_open;
					hydrate_next();
					const server_rendered_pending = comment.data === "[!";
					if (comment.data.startsWith("[?")) {
						const serialized_error = JSON.parse(comment.data.slice(2));
						this.#hydrate_failed_content(serialized_error);
					} else if (server_rendered_pending) this.#hydrate_pending_content();
					else this.#hydrate_resolved_content();
				} else this.#render();
			}, flags);
			if (hydrating) this.#anchor = hydrate_node;
		}
		#hydrate_resolved_content() {
			try {
				this.#main_effect = branch(() => this.#children(this.#anchor));
			} catch (error) {
				this.error(error);
			}
		}
		/**
		* @param {unknown} error The deserialized error from the server's hydration comment
		*/
		#hydrate_failed_content(error) {
			const failed = this.#props.failed;
			const { reset, invoke_onerror } = this.#create_reset(error);
			queue_micro_task(invoke_onerror);
			if (!failed) return;
			this.#failed_effect = branch(() => {
				failed(this.#anchor, () => error, () => reset);
			});
		}
		/**
		* Creates the `reset` function for a failed boundary, along with a function
		* that invokes `onerror` with it (if provided)
		* @param {unknown} error
		* @returns {{ reset: () => void, invoke_onerror: () => void }}
		*/
		#create_reset(error) {
			var did_reset = false;
			var calling_on_error = false;
			const reset = () => {
				if (did_reset) {
					svelte_boundary_reset_noop();
					return;
				}
				did_reset = true;
				if (calling_on_error) svelte_boundary_reset_onerror();
				if (this.#failed_effect !== null) pause_effect(this.#failed_effect, () => {
					this.#failed_effect = null;
				});
				this.#run(() => {
					this.#render();
				});
			};
			const invoke_onerror = () => {
				try {
					calling_on_error = true;
					this.#props.onerror?.(error, reset);
					calling_on_error = false;
				} catch (err) {
					invoke_error_boundary(err, this.#effect && this.#effect.parent);
				}
			};
			return {
				reset,
				invoke_onerror
			};
		}
		#hydrate_pending_content() {
			const pending = this.#props.pending;
			if (!pending) return;
			this.is_pending = true;
			this.#pending_effect = branch(() => pending(this.#anchor));
			queue_micro_task(() => {
				var fragment = this.#offscreen_fragment = document.createDocumentFragment();
				var anchor = create_text();
				var handled = false;
				fragment.append(anchor);
				this.#main_effect = this.#run(() => {
					try {
						return branch(() => this.#children(anchor));
					} catch (error) {
						try {
							this.error(error);
							handled = true;
						} catch (error) {
							invoke_error_boundary(error, this.#effect.parent);
						}
						return null;
					}
				});
				if (this.#main_effect === null) {
					this.#offscreen_fragment = null;
					if (handled) this.#resolve(current_batch);
					return;
				}
				if (this.#pending_count === 0) {
					this.#anchor.before(fragment);
					this.#offscreen_fragment = null;
					pause_effect(this.#pending_effect, () => {
						this.#pending_effect = null;
					});
					this.#resolve(current_batch);
				}
			});
		}
		#render() {
			try {
				this.is_pending = this.has_pending_snippet();
				this.#pending_count = 0;
				this.#local_pending_count = 0;
				this.#main_effect = branch(() => {
					this.#children(this.#anchor);
				});
				if (this.#pending_count > 0) {
					var fragment = this.#offscreen_fragment = document.createDocumentFragment();
					move_effect(this.#main_effect, fragment);
					const pending = this.#props.pending;
					this.#pending_effect = branch(() => pending(this.#anchor));
				} else this.#resolve(current_batch);
			} catch (error) {
				this.error(error);
			}
		}
		/**
		* @param {Batch} batch
		*/
		#resolve(batch) {
			this.is_pending = false;
			batch.transfer_effects(this.#dirty_effects, this.#maybe_dirty_effects);
		}
		/**
		* Defer an effect inside a pending boundary until the boundary resolves
		* @param {Effect} effect
		*/
		defer_effect(effect) {
			defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
		}
		/**
		* Returns `false` if the effect exists inside a boundary whose pending snippet is shown
		* @returns {boolean}
		*/
		is_rendered() {
			return !this.is_pending && (!this.parent || this.parent.is_rendered());
		}
		has_pending_snippet() {
			return !!this.#props.pending;
		}
		/**
		* @template T
		* @param {() => T} fn
		*/
		#run(fn) {
			var previous_effect = active_effect;
			var previous_reaction = active_reaction;
			var previous_ctx = component_context;
			set_active_effect(this.#effect);
			set_active_reaction(this.#effect);
			set_component_context(this.#effect.ctx);
			try {
				Batch.ensure();
				return fn();
			} finally {
				set_active_effect(previous_effect);
				set_active_reaction(previous_reaction);
				set_component_context(previous_ctx);
			}
		}
		/**
		* Updates the pending count associated with the currently visible pending snippet,
		* if any, such that we can replace the snippet with content once work is done
		* @param {1 | -1} d
		* @param {Batch} batch
		*/
		#update_pending_count(d, batch) {
			if (!this.has_pending_snippet()) {
				if (this.parent) this.parent.#update_pending_count(d, batch);
				return;
			}
			this.#pending_count += d;
			if (this.#pending_count === 0) {
				this.#resolve(batch);
				if (this.#pending_effect) pause_effect(this.#pending_effect, () => {
					this.#pending_effect = null;
				});
				if (this.#offscreen_fragment) {
					this.#anchor.before(this.#offscreen_fragment);
					this.#offscreen_fragment = null;
				}
			}
		}
		/**
		* Update the source that powers `$effect.pending()` inside this boundary,
		* and controls when the current `pending` snippet (if any) is removed.
		* Do not call from inside the class
		* @param {1 | -1} d
		* @param {Batch} batch
		*/
		update_pending_count(d, batch) {
			this.#update_pending_count(d, batch);
			this.#local_pending_count += d;
			if (!this.#effect_pending || this.#pending_count_update_queued) return;
			this.#pending_count_update_queued = true;
			queue_micro_task(() => {
				this.#pending_count_update_queued = false;
				if (this.#effect_pending) internal_set(this.#effect_pending, this.#local_pending_count);
			});
		}
		get_effect_pending() {
			this.#effect_pending_subscriber();
			return get$2(this.#effect_pending);
		}
		/** @param {unknown} error */
		error(error) {
			if (!this.#props.onerror && !this.#props.failed) throw error;
			if (current_batch?.is_fork) {
				if (this.#main_effect) current_batch.skip_effect(this.#main_effect);
				if (this.#pending_effect) current_batch.skip_effect(this.#pending_effect);
				if (this.#failed_effect) current_batch.skip_effect(this.#failed_effect);
				current_batch.oncommit(() => {
					this.#handle_error(error);
				});
			} else this.#handle_error(error);
		}
		/**
		* @param {unknown} error
		*/
		#handle_error(error) {
			if (this.#main_effect) {
				destroy_effect(this.#main_effect);
				this.#main_effect = null;
			}
			if (this.#pending_effect) {
				destroy_effect(this.#pending_effect);
				this.#pending_effect = null;
			}
			if (this.#failed_effect) {
				destroy_effect(this.#failed_effect);
				this.#failed_effect = null;
			}
			if (hydrating) {
				set_hydrate_node(this.#hydrate_open);
				next$1();
				set_hydrate_node(skip_nodes());
			}
			let failed = this.#props.failed;
			/** @param {unknown} transformed_error */
			const handle_error_result = (transformed_error) => {
				const { reset, invoke_onerror } = this.#create_reset(transformed_error);
				invoke_onerror();
				if (failed) this.#failed_effect = this.#run(() => {
					try {
						return branch(() => {
							var effect = active_effect;
							effect.b = this;
							effect.f |= 128;
							failed(this.#anchor, () => transformed_error, () => reset);
						});
					} catch (error) {
						invoke_error_boundary(error, this.#effect.parent);
						return null;
					}
				});
			};
			queue_micro_task(() => {
				/** @type {unknown} */
				var result;
				try {
					result = this.transform_error(error);
				} catch (e) {
					invoke_error_boundary(e, this.#effect && this.#effect.parent);
					return;
				}
				if (result !== null && typeof result === "object" && typeof result.then === "function")
 /** @type {any} */ result.then(
					handle_error_result,
					/** @param {unknown} e */
					(e) => invoke_error_boundary(e, this.#effect && this.#effect.parent)
				);
				else handle_error_result(result);
			});
		}
	};
	/**
	* @param {Element} text
	* @param {string} value
	* @returns {void}
	*/
	function set_text(text, value) {
		var str = value == null ? "" : typeof value === "object" ? `${value}` : value;
		if (str !== (text[TEXT_CACHE] ??= text.nodeValue)) {
			/** @type {any} */ text[TEXT_CACHE] = str;
			text.nodeValue = `${str}`;
		}
	}
	/**
	* Mounts a component to the given target and returns the exports and potentially the props (if compiled with `accessors: true`) of the component.
	* Transitions will play during the initial render unless the `intro` option is set to `false`.
	*
	* @template {Record<string, any>} Props
	* @template {Record<string, any>} Exports
	* @param {ComponentType<SvelteComponent<Props>> | Component<Props, Exports, any>} component
	* @param {MountOptions<Props>} options
	* @returns {Exports}
	*/
	function mount(component, options) {
		return _mount(component, options);
	}
	/** @type {Map<EventTarget, Map<string, number>>} */
	var listeners$1 = /* @__PURE__ */ new Map();
	/**
	* @template {Record<string, any>} Exports
	* @param {ComponentType<SvelteComponent<any>> | Component<any>} Component
	* @param {MountOptions} options
	* @returns {Exports}
	*/
	function _mount(Component, { target, anchor, props = {}, events, context, intro = true, transformError }) {
		init_operations();
		/** @type {Exports} */
		var component = void 0;
		var unmount = component_root(() => {
			var anchor_node = anchor ?? target.appendChild(create_text());
			boundary(anchor_node, { pending: () => {} }, (anchor_node) => {
				push({});
				var ctx = component_context;
				if (context) ctx.c = context;
				if (events)
 /** @type {any} */ props.$$events = events;
				if (hydrating) assign_nodes(anchor_node, null);
				component = Component(anchor_node, props) || mark_as_component();
				if (hydrating) {
					/** @type {Effect & { nodes: EffectNodes }} */ active_effect.nodes.end = hydrate_node;
					if (hydrate_node === null || hydrate_node.nodeType !== 8 || hydrate_node.data !== "]") {
						hydration_mismatch();
						throw HYDRATION_ERROR;
					}
				}
				pop();
			}, transformError);
			/** @type {Set<string>} */
			var registered_events = /* @__PURE__ */ new Set();
			/** @param {Array<string>} events */
			var event_handle = (events) => {
				for (var i = 0; i < events.length; i++) {
					var event_name = events[i];
					if (registered_events.has(event_name)) continue;
					registered_events.add(event_name);
					var passive = is_passive_event(event_name);
					for (const node of [target, document]) {
						var counts = listeners$1.get(node);
						if (counts === void 0) {
							counts = /* @__PURE__ */ new Map();
							listeners$1.set(node, counts);
						}
						var count = counts.get(event_name);
						if (count === void 0) {
							node.addEventListener(event_name, handle_event_propagation, { passive });
							counts.set(event_name, 1);
						} else counts.set(event_name, count + 1);
					}
				}
			};
			event_handle(array_from(all_registered_events));
			root_event_handles.add(event_handle);
			return () => {
				for (var event_name of registered_events) for (const node of [target, document]) {
					var counts = listeners$1.get(node);
					var count = counts.get(event_name);
					if (--count == 0) {
						node.removeEventListener(event_name, handle_event_propagation);
						counts.delete(event_name);
						if (counts.size === 0) listeners$1.delete(node);
					} else counts.set(event_name, count);
				}
				root_event_handles.delete(event_handle);
				if (anchor_node !== anchor) anchor_node.parentNode?.removeChild(anchor_node);
			};
		});
		mounted_components.set(component, unmount);
		return component;
	}
	/**
	* References of the components that were mounted or hydrated.
	* Uses a `WeakMap` to avoid memory leaks.
	*/
	var mounted_components = /* @__PURE__ */ new WeakMap();
	/**
	* Unmounts a component that was previously mounted using `mount` or `hydrate`.
	*
	* Since 5.13.0, if `options.outro` is `true`, [transitions](https://svelte.dev/docs/svelte/transition) will play before the component is removed from the DOM.
	*
	* Returns a `Promise` that resolves after transitions have completed if `options.outro` is true, or immediately otherwise (prior to 5.13.0, returns `void`).
	*
	* ```js
	* import { mount, unmount } from 'svelte';
	* import App from './App.svelte';
	*
	* const app = mount(App, { target: document.body });
	*
	* // later...
	* unmount(app, { outro: true });
	* ```
	* @param {Record<string, any>} component
	* @param {{ outro?: boolean }} [options]
	* @returns {Promise<void>}
	*/
	function unmount(component, options) {
		const fn = mounted_components.get(component);
		if (fn) {
			mounted_components.delete(component);
			return fn(options);
		}
		return Promise.resolve();
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/branches.js
	/** @import { Effect, TemplateNode } from '#client' */
	/**
	* @typedef {{ effect: Effect, fragment: DocumentFragment }} Branch
	*/
	/**
	* @template Key
	*/
	var BranchManager = class {
		/** @type {TemplateNode} */
		anchor;
		/** @type {Map<Batch, Key>} */
		#batches = /* @__PURE__ */ new Map();
		/**
		* Map of keys to effects that are currently rendered in the DOM.
		* These effects are visible and actively part of the document tree.
		* Example:
		* ```
		* {#if condition}
		* 	foo
		* {:else}
		* 	bar
		* {/if}
		* ```
		* Can result in the entries `true->Effect` and `false->Effect`
		* @type {Map<Key, Effect>}
		*/
		#onscreen = /* @__PURE__ */ new Map();
		/**
		* Similar to #onscreen with respect to the keys, but contains branches that are not yet
		* in the DOM, because their insertion is deferred.
		* @type {Map<Key, Branch>}
		*/
		#offscreen = /* @__PURE__ */ new Map();
		/**
		* Keys of effects that are currently outroing
		* @type {Set<Key>}
		*/
		#outroing = /* @__PURE__ */ new Set();
		/**
		* Whether to pause (i.e. outro) on change, or destroy immediately.
		* This is necessary for `<svelte:element>`
		*/
		#transition = true;
		/**
		* @param {TemplateNode} anchor
		* @param {boolean} transition
		*/
		constructor(anchor, transition = true) {
			this.anchor = anchor;
			this.#transition = transition;
		}
		/**
		* @param {Batch} batch
		*/
		#commit = (batch) => {
			if (!this.#batches.has(batch)) return;
			var key = this.#batches.get(batch);
			var onscreen = this.#onscreen.get(key);
			if (onscreen) {
				resume_effect(onscreen);
				this.#outroing.delete(key);
			} else {
				var offscreen = this.#offscreen.get(key);
				if (offscreen) {
					resume_effect(offscreen.effect);
					this.#onscreen.set(key, offscreen.effect);
					this.#offscreen.delete(key);
					/** @type {TemplateNode} */ offscreen.fragment.lastChild.remove();
					this.anchor.before(offscreen.fragment);
					onscreen = offscreen.effect;
				}
			}
			for (const [b, k] of this.#batches) {
				this.#batches.delete(b);
				if (b === batch) break;
				const offscreen = this.#offscreen.get(k);
				if (offscreen) {
					destroy_effect(offscreen.effect);
					this.#offscreen.delete(k);
				}
			}
			for (const [k, effect] of this.#onscreen) {
				if (k === key || this.#outroing.has(k)) continue;
				const on_destroy = () => {
					if (Array.from(this.#batches.values()).includes(k)) {
						var fragment = document.createDocumentFragment();
						move_effect(effect, fragment);
						fragment.append(create_text());
						this.#offscreen.set(k, {
							effect,
							fragment
						});
					} else destroy_effect(effect);
					this.#outroing.delete(k);
					this.#onscreen.delete(k);
				};
				if (this.#transition || !onscreen) {
					this.#outroing.add(k);
					pause_effect(effect, on_destroy, false);
				} else on_destroy();
			}
		};
		/**
		* @param {Batch} batch
		*/
		#discard = (batch) => {
			this.#batches.delete(batch);
			const keys = Array.from(this.#batches.values());
			for (const [k, branch] of this.#offscreen) if (!keys.includes(k)) {
				destroy_effect(branch.effect);
				this.#offscreen.delete(k);
			}
		};
		/**
		*
		* @param {any} key
		* @param {null | ((target: TemplateNode) => void)} fn
		*/
		ensure(key, fn) {
			var batch = current_batch;
			var defer = should_defer_append();
			if (fn && !this.#onscreen.has(key) && !this.#offscreen.has(key)) {
				if (defer) {
					var fragment = document.createDocumentFragment();
					var target = create_text();
					fragment.append(target);
					this.#offscreen.set(key, {
						effect: branch(() => fn(target)),
						fragment
					});
				} else this.#onscreen.set(key, branch(() => fn(this.anchor)));
			}
			this.#batches.set(batch, key);
			if (defer) {
				for (const [k, effect] of this.#onscreen) if (k === key) batch.unskip_effect(effect);
				else batch.skip_effect(effect);
				for (const [k, branch] of this.#offscreen) if (k === key) batch.unskip_effect(branch.effect);
				else batch.skip_effect(branch.effect);
				batch.oncommit(this.#commit);
				batch.ondiscard(this.#discard);
			} else {
				if (hydrating) this.anchor = hydrate_node;
				this.#commit(batch);
			}
		}
	};
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/if.js
	/** @import { TemplateNode } from '#client' */
	/**
	* @param {TemplateNode} node
	* @param {(branch: (fn: (anchor: Node) => void, key?: number | false) => void) => void} fn
	* @param {boolean} [elseif] True if this is an `{:else if ...}` block rather than an `{#if ...}`, as that affects which transitions are considered 'local'
	* @returns {void}
	*/
	function if_block(node, fn, elseif = false) {
		/** @type {TemplateNode | undefined} */
		var marker;
		if (hydrating) {
			marker = hydrate_node;
			hydrate_next();
		}
		var branches = new BranchManager(node);
		var flags = elseif ? EFFECT_TRANSPARENT : 0;
		/**
		* @param {number | false} key
		* @param {null | ((anchor: Node) => void)} fn
		*/
		function update_branch(key, fn) {
			if (hydrating) {
				var data = read_hydration_instruction(marker);
				if (key !== parseInt(data.substring(1))) {
					var anchor = skip_nodes();
					set_hydrate_node(anchor);
					branches.anchor = anchor;
					set_hydrating(false);
					branches.ensure(key, fn);
					set_hydrating(true);
					return;
				}
			}
			branches.ensure(key, fn);
		}
		block(() => {
			var has_branch = false;
			fn((fn, key = 0) => {
				has_branch = true;
				update_branch(key, fn);
			});
			if (!has_branch) update_branch(-1, null);
		}, flags);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/key.js
	/** @import { TemplateNode } from '#client' */
	var NAN = Symbol("NaN");
	/**
	* @template V
	* @param {TemplateNode} node
	* @param {() => V} get_key
	* @param {(anchor: Node) => TemplateNode | void} render_fn
	* @returns {void}
	*/
	function key(node, get_key, render_fn) {
		if (hydrating) hydrate_next();
		var branches = new BranchManager(node);
		var legacy = !is_runes();
		block(() => {
			var key = get_key();
			if (key !== key) key = NAN;
			if (legacy && key !== null && typeof key === "object") key = {};
			branches.ensure(key, render_fn);
		});
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/each.js
	/** @import { EachItem, EachOutroGroup, EachState, Effect, EffectNodes, MaybeSource, Source, TemplateNode, TransitionManager, Value } from '#client' */
	/** @import { Batch } from '../../reactivity/batch.js'; */
	/**
	* @param {any} _
	* @param {number} i
	*/
	function index$1(_, i) {
		return i;
	}
	/**
	* Pause multiple effects simultaneously, and coordinate their
	* subsequent destruction. Used in each blocks
	* @param {EachState} state
	* @param {Effect[]} to_destroy
	* @param {null | Node} controlled_anchor
	*/
	function pause_effects(state, to_destroy, controlled_anchor) {
		/** @type {TransitionManager[]} */
		var transitions = [];
		var length = to_destroy.length;
		/** @type {EachOutroGroup} */
		var group;
		var remaining = to_destroy.length;
		for (var i = 0; i < length; i++) {
			let effect = to_destroy[i];
			pause_effect(effect, () => {
				if (group) {
					group.pending.delete(effect);
					group.done.add(effect);
					if (group.pending.size === 0) {
						var groups = state.outrogroups;
						destroy_effects(state, array_from(group.done));
						groups.delete(group);
						if (groups.size === 0) state.outrogroups = null;
					}
				} else remaining -= 1;
			}, false);
		}
		if (remaining === 0) {
			var fast_path = transitions.length === 0 && controlled_anchor !== null && state.pending.size === 0;
			if (fast_path) {
				var anchor = controlled_anchor;
				var parent_node = anchor.parentNode;
				clear_text_content(parent_node);
				parent_node.append(anchor);
				state.items.clear();
			}
			destroy_effects(state, to_destroy, !fast_path);
		} else {
			group = {
				pending: new Set(to_destroy),
				done: /* @__PURE__ */ new Set()
			};
			(state.outrogroups ??= /* @__PURE__ */ new Set()).add(group);
		}
	}
	/**
	* @param {EachState} state
	* @param {Effect[]} to_destroy
	* @param {boolean} remove_dom
	*/
	function destroy_effects(state, to_destroy, remove_dom = true) {
		/** @type {Set<Effect> | undefined} */
		var preserved_effects;
		if (state.pending.size > 0) {
			preserved_effects = /* @__PURE__ */ new Set();
			for (const keys of state.pending.values()) for (const key of keys) preserved_effects.add(
				/** @type {EachItem} */
				state.items.get(key).e
			);
		}
		for (var i = 0; i < to_destroy.length; i++) {
			var e = to_destroy[i];
			if (preserved_effects?.has(e)) {
				e.f |= EFFECT_OFFSCREEN;
				move_effect(e, document.createDocumentFragment());
			} else destroy_effect(to_destroy[i], remove_dom);
		}
	}
	/** @type {TemplateNode} */
	var offscreen_anchor;
	/**
	* @template V
	* @param {Element | Comment} node The next sibling node, or the parent node if this is a 'controlled' block
	* @param {number} flags
	* @param {() => V[]} get_collection
	* @param {(value: V, index: number) => any} get_key
	* @param {(anchor: Node, item: MaybeSource<V>, index: MaybeSource<number>) => void} render_fn
	* @param {null | ((anchor: Node) => void)} fallback_fn
	* @returns {void}
	*/
	function each(node, flags, get_collection, get_key, render_fn, fallback_fn = null) {
		var anchor = node;
		/** @type {Map<any, EachItem>} */
		var items = /* @__PURE__ */ new Map();
		if ((flags & 4) !== 0) {
			var parent_node = node;
			anchor = hydrating ? set_hydrate_node(/* @__PURE__ */ get_first_child(parent_node)) : parent_node.appendChild(create_text());
		}
		if (hydrating) hydrate_next();
		/** @type {Effect | null} */
		var fallback = null;
		var each_array = /* @__PURE__ */ derived_safe_equal(() => {
			var collection = get_collection();
			return is_array(collection) ? collection : collection == null ? [] : array_from(collection);
		});
		/** @type {V[]} */
		var array;
		/** @type {Map<Batch, Set<any>>} */
		var pending = /* @__PURE__ */ new Map();
		var first_run = true;
		/**
		* @param {Batch} batch
		*/
		function commit(batch) {
			if ((state.effect.f & 16384) !== 0) return;
			state.pending.delete(batch);
			state.fallback = fallback;
			reconcile(state, array, anchor, flags, get_key);
			if (fallback !== null) {
				if (array.length === 0) {
					if ((fallback.f & 33554432) === 0) resume_effect(fallback);
					else {
						fallback.f ^= EFFECT_OFFSCREEN;
						move(fallback, null, anchor);
					}
				} else pause_effect(fallback, () => {
					fallback = null;
				});
			}
		}
		/**
		* @param {Batch} batch
		*/
		function discard(batch) {
			state.pending.delete(batch);
		}
		/** @type {EachState} */
		var state = {
			effect: block(() => {
				array = get$2(each_array);
				var length = array.length;
				/** `true` if there was a hydration mismatch. Needs to be a `let` or else it isn't treeshaken out */
				let mismatch = false;
				if (hydrating) {
					if (read_hydration_instruction(anchor) === "[!" !== (length === 0)) {
						anchor = skip_nodes();
						set_hydrate_node(anchor);
						set_hydrating(false);
						mismatch = true;
					}
				}
				var keys = /* @__PURE__ */ new Set();
				var batch = current_batch;
				var defer = should_defer_append();
				for (var index = 0; index < length; index += 1) {
					if (hydrating && hydrate_node.nodeType === 8 && hydrate_node.data === "]") {
						anchor = hydrate_node;
						mismatch = true;
						set_hydrating(false);
					}
					var value = array[index];
					var key = get_key(value, index);
					var item = first_run ? null : items.get(key);
					if (item) {
						if (item.v) internal_set(item.v, value);
						if (item.i) internal_set(item.i, index);
						if (defer) batch.unskip_effect(item.e);
					} else {
						item = create_item(items, first_run ? anchor : offscreen_anchor ??= create_text(), value, key, index, render_fn, flags, get_collection);
						if (!first_run) item.e.f |= EFFECT_OFFSCREEN;
						items.set(key, item);
					}
					keys.add(key);
				}
				if (length === 0 && fallback_fn && !fallback) {
					if (first_run) fallback = branch(() => fallback_fn(anchor));
					else {
						fallback = branch(() => fallback_fn(offscreen_anchor ??= create_text()));
						fallback.f |= EFFECT_OFFSCREEN;
					}
				}
				if (length > keys.size) each_key_duplicate("", "", "");
				if (hydrating && length > 0) set_hydrate_node(skip_nodes());
				if (!first_run) {
					pending.set(batch, keys);
					if (defer) {
						for (const [key, item] of items) if (!keys.has(key)) batch.skip_effect(item.e);
						batch.oncommit(commit);
						batch.ondiscard(discard);
					} else commit(batch);
				}
				if (mismatch) set_hydrating(true);
				get$2(each_array);
			}),
			flags,
			items,
			pending,
			outrogroups: null,
			fallback
		};
		first_run = false;
		if (hydrating) anchor = hydrate_node;
	}
	/**
	* Skip past any non-branch effects (which could be created with `createSubscriber`, for example) to find the next branch effect
	* @param {Effect | null} effect
	* @returns {Effect | null}
	*/
	function skip_to_branch(effect) {
		while (effect !== null && (effect.f & 32) === 0) effect = effect.next;
		return effect;
	}
	/**
	* Add, remove, or reorder items output by an each block as its input changes
	* @template V
	* @param {EachState} state
	* @param {Array<V>} array
	* @param {Element | Comment | Text} anchor
	* @param {number} flags
	* @param {(value: V, index: number) => any} get_key
	* @returns {void}
	*/
	function reconcile(state, array, anchor, flags, get_key) {
		var is_animated = (flags & 8) !== 0;
		var length = array.length;
		var items = state.items;
		var current = skip_to_branch(state.effect.first);
		/** @type {undefined | Set<Effect>} */
		var seen;
		/** @type {Effect | null} */
		var prev = null;
		/** @type {undefined | Set<Effect>} */
		var to_animate;
		/** @type {Effect[]} */
		var matched = [];
		/** @type {Effect[]} */
		var stashed = [];
		/** @type {V} */
		var value;
		/** @type {any} */
		var key;
		/** @type {Effect | undefined} */
		var effect;
		/** @type {number} */
		var i;
		if (is_animated) for (i = 0; i < length; i += 1) {
			value = array[i];
			key = get_key(value, i);
			effect = items.get(key).e;
			if ((effect.f & 33554432) === 0) {
				effect.nodes?.a?.measure();
				(to_animate ??= /* @__PURE__ */ new Set()).add(effect);
			}
		}
		for (i = 0; i < length; i += 1) {
			value = array[i];
			key = get_key(value, i);
			effect = items.get(key).e;
			if (state.outrogroups !== null) for (const group of state.outrogroups) {
				group.pending.delete(effect);
				group.done.delete(effect);
			}
			if ((effect.f & 8192) !== 0) {
				resume_effect(effect);
				if (is_animated) {
					effect.nodes?.a?.unfix();
					(to_animate ??= /* @__PURE__ */ new Set()).delete(effect);
				}
			}
			if ((effect.f & 33554432) !== 0) {
				effect.f ^= EFFECT_OFFSCREEN;
				if (effect === current) move(effect, null, anchor);
				else {
					var next = prev ? prev.next : current;
					if (effect === state.effect.last) state.effect.last = effect.prev;
					if (effect.prev) effect.prev.next = effect.next;
					if (effect.next) effect.next.prev = effect.prev;
					link(state, prev, effect);
					link(state, effect, next);
					move(effect, next, anchor);
					prev = effect;
					matched = [];
					stashed = [];
					current = skip_to_branch(prev.next);
					continue;
				}
			}
			if (effect !== current) {
				if (seen !== void 0 && seen.has(effect)) {
					if (matched.length < stashed.length) {
						var start = stashed[0];
						var j;
						prev = start.prev;
						var a = matched[0];
						var b = matched[matched.length - 1];
						for (j = 0; j < matched.length; j += 1) move(matched[j], start, anchor);
						for (j = 0; j < stashed.length; j += 1) seen.delete(stashed[j]);
						link(state, a.prev, b.next);
						link(state, prev, a);
						link(state, b, start);
						current = start;
						prev = b;
						i -= 1;
						matched = [];
						stashed = [];
					} else {
						seen.delete(effect);
						move(effect, current, anchor);
						link(state, effect.prev, effect.next);
						link(state, effect, prev === null ? state.effect.first : prev.next);
						link(state, prev, effect);
						prev = effect;
					}
					continue;
				}
				matched = [];
				stashed = [];
				while (current !== null && current !== effect) {
					(seen ??= /* @__PURE__ */ new Set()).add(current);
					stashed.push(current);
					current = skip_to_branch(current.next);
				}
				if (current === null) continue;
			}
			if ((effect.f & 33554432) === 0) matched.push(effect);
			prev = effect;
			current = skip_to_branch(effect.next);
		}
		if (state.outrogroups !== null) {
			for (const group of state.outrogroups) if (group.pending.size === 0) {
				destroy_effects(state, array_from(group.done));
				state.outrogroups?.delete(group);
			}
			if (state.outrogroups.size === 0) state.outrogroups = null;
		}
		if (current !== null || seen !== void 0) {
			/** @type {Effect[]} */
			var to_destroy = [];
			if (seen !== void 0) {
				for (effect of seen) if ((effect.f & 8192) === 0) to_destroy.push(effect);
			}
			while (current !== null) {
				if ((current.f & 8192) === 0 && current !== state.fallback) to_destroy.push(current);
				current = skip_to_branch(current.next);
			}
			var destroy_length = to_destroy.length;
			if (destroy_length > 0) {
				var controlled_anchor = (flags & 4) !== 0 && length === 0 ? anchor : null;
				if (is_animated) {
					for (i = 0; i < destroy_length; i += 1) to_destroy[i].nodes?.a?.measure();
					for (i = 0; i < destroy_length; i += 1) to_destroy[i].nodes?.a?.fix();
				}
				pause_effects(state, to_destroy, controlled_anchor);
			}
		}
		if (is_animated) queue_micro_task(() => {
			if (to_animate === void 0) return;
			for (effect of to_animate) effect.nodes?.a?.apply();
		});
	}
	/**
	* @template V
	* @param {Map<any, EachItem>} items
	* @param {Node} anchor
	* @param {V} value
	* @param {unknown} key
	* @param {number} index
	* @param {(anchor: Node, item: V | Source<V>, index: number | Value<number>, collection: () => V[]) => void} render_fn
	* @param {number} flags
	* @param {() => V[]} get_collection
	* @returns {EachItem}
	*/
	function create_item(items, anchor, value, key, index, render_fn, flags, get_collection) {
		var v = (flags & 1) !== 0 ? (flags & 16) === 0 ? /* @__PURE__ */ mutable_source(value, false, false) : source(value) : null;
		var i = (flags & 2) !== 0 ? source(index) : null;
		return {
			v,
			i,
			e: branch(() => {
				render_fn(anchor, v ?? value, i ?? index, get_collection);
				return () => {
					items.delete(key);
				};
			})
		};
	}
	/**
	* @param {Effect} effect
	* @param {Effect | null} next
	* @param {Text | Element | Comment} anchor
	*/
	function move(effect, next, anchor) {
		if (!effect.nodes) return;
		var node = effect.nodes.start;
		var end = effect.nodes.end;
		var dest = next && (next.f & 33554432) === 0 ? next.nodes.start : anchor;
		while (node !== null) {
			var next_node = /* @__PURE__ */ get_next_sibling(node);
			dest.before(node);
			if (node === end) return;
			node = next_node;
		}
	}
	/**
	* @param {EachState} state
	* @param {Effect | null} prev
	* @param {Effect | null} next
	*/
	function link(state, prev, next) {
		if (prev === null) state.effect.first = next;
		else prev.next = next;
		if (next === null) state.effect.last = prev;
		else next.prev = prev;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/snippet.js
	/** @import { Snippet } from 'svelte' */
	/** @import { TemplateNode } from '#client' */
	/** @import { Getters } from '#shared' */
	/**
	* @template {(node: TemplateNode, ...args: any[]) => void} SnippetFn
	* @param {TemplateNode} node
	* @param {() => SnippetFn | null | undefined} get_snippet
	* @param {(() => any)[]} args
	* @returns {void}
	*/
	function snippet(node, get_snippet, ...args) {
		var branches = new BranchManager(node);
		block(() => {
			const snippet = get_snippet() ?? null;
			branches.ensure(snippet, snippet && ((anchor) => snippet(anchor, ...args)));
		}, EFFECT_TRANSPARENT);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/svelte-component.js
	/** @import { TemplateNode, Dom } from '#client' */
	/**
	* @template P
	* @template {(props: P) => void} C
	* @param {TemplateNode} node
	* @param {() => C} get_component
	* @param {(anchor: TemplateNode, component: C) => Dom | void} render_fn
	* @returns {void}
	*/
	function component(node, get_component, render_fn) {
		/** @type {TemplateNode | undefined} */
		var hydration_start_node;
		if (hydrating) {
			hydration_start_node = hydrate_node;
			hydrate_next();
		}
		var branches = new BranchManager(node);
		block(() => {
			var component = get_component() ?? null;
			if (hydrating) {
				if (read_hydration_instruction(hydration_start_node) === "[" !== (component !== null)) {
					var anchor = skip_nodes();
					set_hydrate_node(anchor);
					branches.anchor = anchor;
					set_hydrating(false);
					branches.ensure(component, component && ((target) => render_fn(target, component)));
					set_hydrating(true);
					return;
				}
			}
			branches.ensure(component, component && ((target) => render_fn(target, component)));
		}, EFFECT_TRANSPARENT);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/blocks/svelte-element.js
	/** @import { Effect, EffectNodes, TemplateNode } from '#client' */
	/**
	* @param {Comment | Element} node
	* @param {() => string} get_tag
	* @param {boolean} is_svg
	* @param {undefined | ((element: Element, anchor: Node | null) => void)} render_fn,
	* @param {undefined | (() => string)} get_namespace
	* @param {undefined | [number, number]} location
	* @returns {void}
	*/
	function element$1(node, get_tag, is_svg, render_fn, get_namespace, location) {
		let was_hydrating = hydrating;
		if (hydrating) hydrate_next();
		/** @type {null | Element} */
		var element = null;
		if (hydrating && hydrate_node.nodeType === 1) {
			element = hydrate_node;
			hydrate_next();
		}
		var anchor = hydrating ? hydrate_node : node;
		var branches = new BranchManager(anchor, false);
		block(() => {
			const next_tag = get_tag() || null;
			var ns = get_namespace ? get_namespace() : is_svg || next_tag === "svg" ? NAMESPACE_SVG : void 0;
			if (next_tag === null) {
				branches.ensure(null, null);
				return;
			}
			branches.ensure(next_tag, (anchor) => {
				if (next_tag) {
					element = hydrating ? element : create_element(next_tag, ns);
					assign_nodes(element, element);
					if (render_fn) {
						var tmp_comment = null;
						if (hydrating && is_raw_text_element(next_tag)) element.append(tmp_comment = document.createComment(""));
						var child_anchor = hydrating ? /* @__PURE__ */ get_first_child(element) : element.appendChild(create_text());
						if (hydrating) {
							if (child_anchor === null) set_hydrating(false);
							else set_hydrate_node(child_anchor);
						}
						render_fn(element, child_anchor);
						tmp_comment?.remove();
					}
					/** @type {Effect & { nodes: EffectNodes }} */ active_effect.nodes.end = element;
					anchor.before(element);
				}
				if (hydrating) set_hydrate_node(anchor);
			});
			return () => {
				if (next_tag);
			};
		}, EFFECT_TRANSPARENT);
		teardown(() => {});
		if (was_hydrating) {
			set_hydrating(true);
			set_hydrate_node(anchor);
		}
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/attachments.js
	/** @import { Effect } from '#client' */
	/**
	* @param {Element} node
	* @param {() => (node: Element) => void} get_fn
	*/
	function attach(node, get_fn) {
		/** @type {false | undefined | ((node: Element) => void)} */
		var fn = void 0;
		/** @type {Effect | null} */
		var e;
		managed(() => {
			if (fn !== (fn = get_fn())) {
				if (e) {
					destroy_effect(e);
					e = null;
				}
				if (fn) e = branch(() => {
					effect(() => fn(node));
				});
			}
		});
	}
	//#endregion
	//#region node_modules/clsx/dist/clsx.mjs
	function r(e) {
		var t, f, n = "";
		if ("string" == typeof e || "number" == typeof e) n += e;
		else if ("object" == typeof e) if (Array.isArray(e)) {
			var o = e.length;
			for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
		} else for (f in e) e[f] && (n && (n += " "), n += f);
		return n;
	}
	function clsx$1() {
		for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
		return n;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/shared/attributes.js
	/**
	* Small wrapper around clsx to preserve Svelte's (weird) handling of falsy values.
	* TODO Svelte 6 revisit this, and likely turn all falsy values into the empty string (what clsx also does)
	* @param  {any} value
	*/
	function clsx(value) {
		if (typeof value === "object") return clsx$1(value);
		else return value ?? "";
	}
	var whitespace = [..." 	\n\r\f\xA0\v﻿"];
	/**
	* @param {any} value
	* @param {string | null} [hash]
	* @param {Record<string, boolean>} [directives]
	* @returns {string | null}
	*/
	function to_class(value, hash, directives) {
		var classname = value == null ? "" : "" + value;
		if (hash) classname = classname ? classname + " " + hash : hash;
		if (directives) {
			for (var key of Object.keys(directives)) if (directives[key]) classname = classname ? classname + " " + key : key;
			else if (classname.length) {
				var len = key.length;
				var a = 0;
				while ((a = classname.indexOf(key, a)) >= 0) {
					var b = a + len;
					if ((a === 0 || whitespace.includes(classname[a - 1])) && (b === classname.length || whitespace.includes(classname[b]))) classname = (a === 0 ? "" : classname.substring(0, a)) + classname.substring(b + 1);
					else a = b;
				}
			}
		}
		return classname === "" ? null : classname;
	}
	/**
	*
	* @param {Record<string,any>} styles
	* @param {boolean} important
	*/
	function append_styles(styles, important = false) {
		var separator = important ? " !important;" : ";";
		var css = "";
		for (var key of Object.keys(styles)) {
			var value = styles[key];
			if (value != null && value !== "") css += " " + key + ": " + value + separator;
		}
		return css;
	}
	/**
	* @param {string} name
	* @returns {string}
	*/
	function to_css_name(name) {
		if (name[0] !== "-" || name[1] !== "-") return name.toLowerCase();
		return name;
	}
	/**
	* @param {any} value
	* @param {Record<string, any> | [Record<string, any>, Record<string, any>]} [styles]
	* @returns {string | null}
	*/
	function to_style(value, styles) {
		if (styles) {
			var new_style = "";
			/** @type {Record<string,any> | undefined} */
			var normal_styles;
			/** @type {Record<string,any> | undefined} */
			var important_styles;
			if (Array.isArray(styles)) {
				normal_styles = styles[0];
				important_styles = styles[1];
			} else normal_styles = styles;
			if (value) {
				value = String(value).replaceAll(/\/\*.*?\*\//g, "").trim();
				/** @type {boolean | '"' | "'"} */
				var in_str = false;
				var in_apo = 0;
				var in_comment = false;
				var reserved_names = [];
				if (normal_styles) reserved_names.push(...Object.keys(normal_styles).map(to_css_name));
				if (important_styles) reserved_names.push(...Object.keys(important_styles).map(to_css_name));
				var start_index = 0;
				var name_index = -1;
				const len = value.length;
				for (var i = 0; i < len; i++) {
					var c = value[i];
					if (in_comment) {
						if (c === "/" && value[i - 1] === "*") in_comment = false;
					} else if (in_str) {
						if (in_str === c) in_str = false;
					} else if (c === "/" && value[i + 1] === "*") in_comment = true;
					else if (c === "\"" || c === "'") in_str = c;
					else if (c === "(") in_apo++;
					else if (c === ")") in_apo--;
					if (!in_comment && in_str === false && in_apo === 0) {
						if (c === ":" && name_index === -1) name_index = i;
						else if (c === ";" || i === len - 1) {
							if (name_index !== -1) {
								var name = to_css_name(value.substring(start_index, name_index).trim());
								if (!reserved_names.includes(name)) {
									if (c !== ";") i++;
									var property = value.substring(start_index, i).trim();
									new_style += " " + property + ";";
								}
							}
							start_index = i + 1;
							name_index = -1;
						}
					}
				}
			}
			if (normal_styles) new_style += append_styles(normal_styles);
			if (important_styles) new_style += append_styles(important_styles, true);
			new_style = new_style.trim();
			return new_style === "" ? null : new_style;
		}
		return value == null ? null : String(value);
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/class.js
	/**
	* @param {Element} dom
	* @param {boolean | number} is_html
	* @param {string | null} value
	* @param {string} [hash]
	* @param {Record<string, any>} [prev_classes]
	* @param {Record<string, any>} [next_classes]
	* @returns {Record<string, boolean> | undefined}
	*/
	function set_class(dom, is_html, value, hash, prev_classes, next_classes) {
		var prev = dom[CLASS_CACHE];
		if (hydrating || prev !== value || prev === void 0) {
			var next_class_name = to_class(value, hash, next_classes);
			if (!hydrating || next_class_name !== dom.getAttribute("class")) {
				if (next_class_name == null) dom.removeAttribute("class");
				else if (is_html) dom.className = next_class_name;
				else dom.setAttribute("class", next_class_name);
			}
			/** @type {any} */ dom[CLASS_CACHE] = value;
		} else if (next_classes && prev_classes !== next_classes) for (var key in next_classes) {
			var is_present = !!next_classes[key];
			if (prev_classes == null || is_present !== !!prev_classes[key]) dom.classList.toggle(key, is_present);
		}
		return next_classes;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/style.js
	/**
	* @param {Element & ElementCSSInlineStyle} dom
	* @param {Record<string, any>} prev
	* @param {Record<string, any>} next
	* @param {string} [priority]
	*/
	function update_styles(dom, prev = {}, next, priority) {
		for (var key in next) {
			var value = next[key];
			if (prev[key] !== value) {
				if (next[key] == null) dom.style.removeProperty(key);
				else dom.style.setProperty(key, value, priority);
			}
		}
	}
	/**
	* @param {Element & ElementCSSInlineStyle} dom
	* @param {string | null} value
	* @param {Record<string, any> | [Record<string, any>, Record<string, any>]} [prev_styles]
	* @param {Record<string, any> | [Record<string, any>, Record<string, any>]} [next_styles]
	*/
	function set_style(dom, value, prev_styles, next_styles) {
		var prev = dom[STYLE_CACHE];
		if (hydrating || prev !== value) {
			var next_style_attr = to_style(value, next_styles);
			if (!hydrating || next_style_attr !== dom.getAttribute("style")) {
				if (next_style_attr == null) dom.removeAttribute("style");
				else dom.style.cssText = next_style_attr;
			}
			/** @type {any} */ dom[STYLE_CACHE] = value;
		} else if (next_styles) {
			if (Array.isArray(next_styles)) {
				update_styles(dom, prev_styles?.[0], next_styles[0]);
				update_styles(dom, prev_styles?.[1], next_styles[1], "important");
			} else update_styles(dom, prev_styles, next_styles);
		}
		return next_styles;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
	/**
	* Sets the `selected` attribute on an option so form reset can restore it.
	* @param {HTMLOptionElement} option
	* @param {boolean} selected
	*/
	function set_selected(option, selected) {
		if (selected) {
			if (!option.hasAttribute("selected")) option.setAttribute("selected", "");
		} else option.removeAttribute("selected");
	}
	/**
	* Sets the options a form reset should restore. The first call selects
	* them if nothing has set a value, later calls leave the current selection alone.
	* @param {HTMLSelectElement} select
	* @param {any} value
	*/
	function set_default_select_value(select, value) {
		var mounting = !("__defaultValue" in select);
		if (!mounting && select.__defaultValue === value) return;
		select.__defaultValue = value;
		apply_default_select_value(select, !mounting || "__value" in select);
	}
	/**
	* Marks the options matching `__defaultValue` as selected. Without `preserve`
	* a newly matching option gets selected, as an inserted `<option selected>` would.
	* @param {HTMLSelectElement} select
	* @param {boolean} preserve
	*/
	function apply_default_select_value(select, preserve) {
		var value = select.__defaultValue;
		var multiple = select.multiple;
		var values = multiple ? value ?? [] : null;
		if (multiple && !is_array(values)) return;
		var index = select.selectedIndex;
		var selected = preserve && multiple ? new Set(select.selectedOptions) : null;
		for (var option of select.options) {
			var option_value = get_option_value(option);
			set_selected(option, multiple ? values.includes(option_value) : is(option_value, value));
		}
		if (!preserve) return;
		if (selected !== null) for (option of select.options) {
			var was_selected = selected.has(option);
			if (option.selected !== was_selected) option.selected = was_selected;
		}
		else if (select.selectedIndex !== index) select.selectedIndex = index;
	}
	/**
	* Selects the correct option(s) (depending on whether this is a multiple select)
	* @template V
	* @param {HTMLSelectElement} select
	* @param {V} value
	* @param {boolean} mounting
	*/
	function select_option(select, value, mounting = false) {
		if (select.multiple) {
			if (value == void 0) return;
			if (!is_array(value)) return select_multiple_invalid_value();
			for (var option of select.options) option.selected = value.includes(get_option_value(option));
			return;
		}
		for (option of select.options) if (is(get_option_value(option), value)) {
			option.selected = true;
			return;
		}
		if (!mounting || value !== void 0) select.selectedIndex = -1;
	}
	/**
	* Sets up a mutation observer to sync the current selection
	* and default to the dom when the options change, for example
	* when they are inside an `#each` block. Called once per `<select>`,
	* by the compiled output or by `attribute_effect` for spreads.
	* @param {HTMLSelectElement} select
	*/
	function init_select(select) {
		var observer = new MutationObserver((entries) => {
			if (entries.every(is_selectedcontent_mutation)) return;
			if ("__defaultValue" in select) apply_default_select_value(select, false);
			if ("__value" in select) select_option(select, select.__value);
		});
		observer.observe(select, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["value"]
		});
		teardown(() => {
			observer.disconnect();
		});
	}
	/** @param {HTMLOptionElement} option */
	function get_option_value(option) {
		if ("__value" in option) return option.__value;
		else return option.value;
	}
	/**
	* Returns `true` if the mutation stems from the browser mirroring the selected
	* option's content into `<selectedcontent>`, or from us replacing the
	* `<selectedcontent>` element with a clone of itself
	* @param {MutationRecord} entry
	*/
	function is_selectedcontent_mutation(entry) {
		if (entry.target.closest("selectedcontent") !== null) return true;
		if (entry.type === "childList") {
			var nodes = [...entry.addedNodes, ...entry.removedNodes];
			return nodes.length > 0 && nodes.every((node) => node.nodeName === "SELECTEDCONTENT");
		}
		return false;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/attributes.js
	/** @import { Blocker, Effect } from '#client' */
	var CLASS = Symbol("class");
	var STYLE = Symbol("style");
	var IS_CUSTOM_ELEMENT = Symbol("is custom element");
	var IS_HTML = Symbol("is html");
	var LINK_TAG = IS_XHTML ? "link" : "LINK";
	var INPUT_TAG = IS_XHTML ? "input" : "INPUT";
	var OPTION_TAG = IS_XHTML ? "option" : "OPTION";
	var SELECT_TAG = IS_XHTML ? "select" : "SELECT";
	/**
	* The value/checked attribute in the template actually corresponds to the defaultValue property, so we need
	* to remove it upon hydration to avoid a bug when someone resets the form value.
	* @param {HTMLInputElement} input
	* @returns {void}
	*/
	function remove_input_defaults(input) {
		if (!hydrating) return;
		var already_removed = false;
		var remove_defaults = () => {
			if (already_removed) return;
			already_removed = true;
			if (input.hasAttribute("value")) {
				var value = input.value;
				set_attribute(input, "value", null);
				input.value = value;
			}
			if (input.hasAttribute("checked")) {
				var checked = input.checked;
				set_attribute(input, "checked", null);
				input.checked = checked;
			}
		};
		/** @type {any} */ input[FORM_RESET_HANDLER] = remove_defaults;
		queue_micro_task(remove_defaults);
		add_form_reset_listener();
	}
	/**
	* @param {Element} element
	* @param {string} attribute
	* @param {string | null} value
	* @param {boolean} [skip_warning]
	*/
	function set_attribute(element, attribute, value, skip_warning) {
		var attributes = get_attributes(element);
		if (hydrating) {
			attributes[attribute] = element.getAttribute(attribute);
			if (attribute === "src" || attribute === "srcset" || attribute === "href" && element.nodeName === LINK_TAG) {
				if (!skip_warning);
				return;
			}
		}
		if (attributes[attribute] === (attributes[attribute] = value)) return;
		if (attribute === "loading") element[LOADING_ATTR_SYMBOL] = value;
		if (value == null) element.removeAttribute(attribute);
		else if (typeof value !== "string" && get_setters(element).has(attribute)) element[attribute] = value;
		else element.setAttribute(attribute, value);
	}
	/**
	* Spreads attributes onto a DOM element, taking into account the currently set attributes
	* @param {Element & ElementCSSInlineStyle} element
	* @param {Record<string | symbol, any> | undefined} prev
	* @param {Record<string | symbol, any>} next New attributes - this function mutates this object
	* @param {string} [css_hash]
	* @param {boolean} [should_remove_defaults]
	* @param {boolean} [skip_warning]
	* @returns {Record<string, any>}
	*/
	function set_attributes(element, prev, next, css_hash, should_remove_defaults = false, skip_warning = false) {
		if (hydrating && should_remove_defaults && element.nodeName === INPUT_TAG) {
			if (!("defaultValue" in next || "defaultChecked" in next)) remove_input_defaults(element);
		}
		var attributes = get_attributes(element);
		var is_custom_element = attributes[IS_CUSTOM_ELEMENT];
		var preserve_attribute_case = !attributes[IS_HTML];
		let is_hydrating_custom_element = hydrating && is_custom_element;
		if (is_hydrating_custom_element) set_hydrating(false);
		var current = prev || {};
		var is_option_element = element.nodeName === OPTION_TAG;
		var is_select_element = element.nodeName === SELECT_TAG;
		for (var key in prev) if (!(key in next) && key[0] + key[1] !== "$$") next[key] = null;
		if (next.class) next.class = clsx(next.class);
		else if (css_hash || next[CLASS]) next.class = null;
		if (next[STYLE]) next.style ??= null;
		var setters = get_setters(element);
		if (element.nodeName === INPUT_TAG && "type" in next && ("value" in next || "__value" in next)) {
			var type = next.type;
			if (type !== current.type || type === void 0 && element.hasAttribute("type")) {
				current.type = type;
				set_attribute(element, "type", type, skip_warning);
			}
		}
		for (const key in next) {
			let value = next[key];
			if (is_option_element && key === "value" && value == null) {
				element.value = element.__value = "";
				current[key] = value;
				continue;
			}
			if (key === "class") {
				set_class(element, element.namespaceURI === "http://www.w3.org/1999/xhtml", value, css_hash, prev?.[CLASS], next[CLASS]);
				current[key] = value;
				current[CLASS] = next[CLASS];
				continue;
			}
			if (key === "style") {
				set_style(element, value, prev?.[STYLE], next[STYLE]);
				current[key] = value;
				current[STYLE] = next[STYLE];
				continue;
			}
			var prev_value = current[key];
			if (value === prev_value && !(value === void 0 && element.hasAttribute(key))) continue;
			current[key] = value;
			var prefix = key[0] + key[1];
			if (prefix === "$$") continue;
			if (prefix === "on") {
				/** @type {{ capture?: true }} */
				const opts = {};
				const event_handle_key = "$$" + key;
				let event_name = key.slice(2);
				var is_delegated = can_delegate_event(event_name);
				if (is_capture_event(event_name)) {
					event_name = event_name.slice(0, -7);
					opts.capture = true;
				}
				if (!is_delegated && prev_value) {
					if (value != null) continue;
					element.removeEventListener(event_name, current[event_handle_key], opts);
					current[event_handle_key] = null;
				}
				if (is_delegated) {
					delegated(event_name, element, value);
					delegate([event_name]);
				} else if (value != null) {
					/**
					* @this {any}
					* @param {Event} evt
					*/
					function handle(evt) {
						current[key].call(this, evt);
					}
					current[event_handle_key] = create_event(event_name, element, handle, opts);
				}
			} else if (key === "style") set_attribute(element, key, value);
			else if (key === "autofocus") autofocus(element, Boolean(value));
			else if (!is_custom_element && (key === "__value" || key === "value" && value != null)) element.value = element.__value = value;
			else if (key === "selected" && is_option_element) set_selected(element, value);
			else {
				var name = key;
				if (!preserve_attribute_case) name = normalize_attribute(name);
				var is_default = name === "defaultValue" || name === "defaultChecked";
				if (is_select_element && name === "defaultValue") continue;
				if (value == null && !is_custom_element && !is_default) {
					attributes[key] = null;
					if (name === "value" || name === "checked") {
						let input = element;
						const use_default = prev === void 0;
						if (name === "value") {
							let previous = input.defaultValue;
							input.removeAttribute(name);
							input.defaultValue = previous;
							input.value = input.__value = use_default ? previous : null;
						} else {
							let previous = input.defaultChecked;
							input.removeAttribute(name);
							input.defaultChecked = previous;
							input.checked = use_default ? previous : false;
						}
					} else element.removeAttribute(key);
				} else if (is_default || (is_custom_element || typeof value !== "string") && setters.has(name)) {
					element[name] = value;
					if (name in attributes) attributes[name] = UNINITIALIZED;
				} else if (typeof value !== "function") set_attribute(element, name, value, skip_warning);
			}
		}
		if (is_hydrating_custom_element) set_hydrating(true);
		return current;
	}
	/**
	* @param {Element & ElementCSSInlineStyle} element
	* @param {(...expressions: any) => Record<string | symbol, any>} fn
	* @param {Array<() => any>} sync
	* @param {Array<() => Promise<any>>} async
	* @param {Blocker[]} blockers
	* @param {string} [css_hash]
	* @param {boolean} [should_remove_defaults]
	* @param {boolean} [skip_warning]
	*/
	function attribute_effect(element, fn, sync = [], async = [], blockers = [], css_hash, should_remove_defaults = false, skip_warning = false) {
		flatten(blockers, sync, async, (values) => {
			/** @type {Record<string | symbol, any> | undefined} */
			var prev = void 0;
			/** @type {Record<symbol, Effect>} */
			var effects = {};
			var is_select = element.nodeName === SELECT_TAG;
			var inited = false;
			managed(() => {
				var next = fn(...values.map(get$2));
				/** @type {Record<string | symbol, any>} */
				var current = set_attributes(element, prev, next, css_hash, should_remove_defaults, skip_warning);
				if (inited && is_select) {
					var select = element;
					if ("defaultValue" in next) set_default_select_value(select, next.defaultValue);
					if ("value" in next) select_option(select, next.value);
				}
				for (let symbol of Object.getOwnPropertySymbols(effects)) if (!next[symbol]) destroy_effect(effects[symbol]);
				for (let symbol of Object.getOwnPropertySymbols(next)) {
					var n = next[symbol];
					if (symbol.description === "@attach" && (!prev || n !== prev[symbol])) {
						if (effects[symbol]) destroy_effect(effects[symbol]);
						effects[symbol] = branch(() => attach(element, () => n));
					}
					current[symbol] = n;
				}
				prev = current;
			});
			if (is_select) {
				var select = element;
				effect(() => {
					var attrs = prev;
					if ("defaultValue" in attrs) set_default_select_value(select, attrs.defaultValue);
					select_option(select, attrs.value, true);
					init_select(select);
				});
			}
			inited = true;
		});
	}
	/**
	*
	* @param {Element} element
	*/
	function get_attributes(element) {
		return element[ATTRIBUTES_CACHE] ??= {
			[IS_CUSTOM_ELEMENT]: element.nodeName.includes("-"),
			[IS_HTML]: element.namespaceURI === NAMESPACE_HTML
		};
	}
	/** @type {Map<string, Set<string>>} */
	var setters_cache = /* @__PURE__ */ new Map();
	/** @param {Element} element */
	function get_setters(element) {
		var cache_key = element.getAttribute("is") || element.nodeName;
		var setters = setters_cache.get(cache_key);
		if (setters) return setters;
		setters_cache.set(cache_key, setters = /* @__PURE__ */ new Set());
		var descriptors;
		var proto = element;
		var element_proto = Element.prototype;
		while (element_proto !== proto) {
			descriptors = get_descriptors(proto);
			for (var key in descriptors) if (descriptors[key].set && key !== "innerHTML" && key !== "textContent" && key !== "innerText") setters.add(key);
			proto = get_prototype_of(proto);
		}
		return setters;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
	/** @import { Batch } from '../../../reactivity/batch.js' */
	/**
	* @param {HTMLInputElement} input
	* @param {() => unknown} get
	* @param {(value: unknown) => void} set
	* @returns {void}
	*/
	function bind_value(input, get, set = get) {
		var batches = /* @__PURE__ */ new WeakSet();
		listen_to_event_and_reset_event(input, "input", async (is_reset) => {
			/** @type {any} */
			var value = is_reset ? input.defaultValue : input.value;
			value = is_numberlike_input(input) ? to_number(value) : value;
			set(value);
			if (current_batch !== null) batches.add(current_batch);
			await tick();
			if (value !== (value = get())) {
				var start = input.selectionStart;
				var end = input.selectionEnd;
				var length = input.value.length;
				input.value = value ?? "";
				if (end !== null) {
					var new_length = input.value.length;
					if (start === end && end === length && new_length > length) {
						input.selectionStart = new_length;
						input.selectionEnd = new_length;
					} else {
						input.selectionStart = start;
						input.selectionEnd = Math.min(end, new_length);
					}
				}
			}
		});
		if (hydrating && input.defaultValue !== input.value || untrack(get) == null && input.value) {
			set(is_numberlike_input(input) ? to_number(input.value) : input.value);
			if (current_batch !== null) batches.add(current_batch);
		}
		render_effect(() => {
			var value = get();
			if (input === document.activeElement) {
				var batch = async_mode_flag ? previous_batch : current_batch;
				if (batches.has(batch)) return;
			}
			if (is_numberlike_input(input) && value === to_number(input.value)) return;
			if (input.type === "date" && !value && !input.value) return;
			if (value !== input.value) input.value = value ?? "";
		});
	}
	/**
	* @param {HTMLInputElement} input
	*/
	function is_numberlike_input(input) {
		var type = input.type;
		return type === "number" || type === "range";
	}
	/**
	* @param {string} value
	*/
	function to_number(value) {
		return value === "" ? null : +value;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
	/** @import { ComponentContext, Effect } from '#client' */
	/**
	* @param {any} bound_value
	* @param {Element} element_or_component
	* @returns {boolean}
	*/
	function is_bound_this(bound_value, element_or_component) {
		return bound_value === element_or_component || bound_value?.[STATE_SYMBOL] === element_or_component;
	}
	/**
	* @param {any} element_or_component
	* @param {(value: unknown, ...parts: unknown[]) => void} update
	* @param {(...parts: unknown[]) => unknown} get_value
	* @param {() => unknown[]} [get_parts] Set if the this binding is used inside an each block,
	* 										returns all the parts of the each block context that are used in the expression
	* @returns {void}
	*/
	function bind_this(element_or_component = mark_as_component(), update, get_value, get_parts) {
		var component_effect = component_context.r;
		var parent = active_effect;
		effect(() => {
			/** @type {unknown[]} */
			var old_parts;
			/** @type {unknown[]} */
			var parts;
			render_effect(() => {
				old_parts = parts;
				parts = get_parts?.() || [];
				untrack(() => {
					if (!is_bound_this(get_value(...parts), element_or_component)) {
						update(element_or_component, ...parts);
						if (old_parts && is_bound_this(get_value(...old_parts), element_or_component)) update(null, ...old_parts);
					}
				});
			});
			return () => {
				let p = parent;
				while (p !== component_effect && p.parent !== null && p.parent.f & 33554432) p = p.parent;
				const teardown = () => {
					if (parts && is_bound_this(get_value(...parts), element_or_component)) update(null, ...parts);
				};
				const original_teardown = p.teardown;
				p.teardown = () => {
					teardown();
					original_teardown?.();
				};
			};
		});
		return element_or_component;
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/store.js
	/**
	* Whether or not the prop currently being read is a store binding, as in
	* `<Child bind:x={$y} />`. If it is, we treat the prop as mutable even in
	* runes mode, and skip `binding_property_non_reactive` validation
	*/
	var is_store_binding = false;
	/**
	* Returns a tuple that indicates whether `fn()` reads a prop that is a store binding.
	* Used to prevent `binding_property_non_reactive` validation false positives and
	* ensure that these props are treated as mutable even in runes mode
	* @template T
	* @param {() => T} fn
	* @returns {[T, boolean]}
	*/
	function capture_store_binding(fn) {
		var previous_is_store_binding = is_store_binding;
		try {
			is_store_binding = false;
			return [fn(), is_store_binding];
		} finally {
			is_store_binding = previous_is_store_binding;
		}
	}
	//#endregion
	//#region node_modules/svelte/src/internal/client/reactivity/props.js
	/** @import { Derived, Effect, Source } from './types.js' */
	/**
	* The proxy handler for rest props (i.e. `const { x, ...rest } = $props()`).
	* Is passed the full `$$props` object and excludes the named props.
	* @type {ProxyHandler<{ props: Record<string | symbol, unknown>, exclude: Set<string | symbol>, name?: string }>}}
	*/
	var rest_props_handler = {
		get(target, key) {
			if (target.exclude.has(key)) return;
			return target.props[key];
		},
		set(target, key) {
			return false;
		},
		getOwnPropertyDescriptor(target, key) {
			if (target.exclude.has(key)) return;
			if (key in target.props) return {
				enumerable: true,
				configurable: true,
				value: target.props[key]
			};
		},
		has(target, key) {
			if (target.exclude.has(key)) return false;
			return key in target.props;
		},
		ownKeys(target) {
			return Reflect.ownKeys(target.props).filter((key) => !target.exclude.has(key));
		}
	};
	/**
	* @param {Record<string, unknown>} props
	* @param {Set<string>} exclude
	* @param {string} [name]
	* @returns {Record<string, unknown>}
	*/
	/*#__NO_SIDE_EFFECTS__*/
	function rest_props(props, exclude, name) {
		return new Proxy({
			props,
			exclude
		}, rest_props_handler);
	}
	/**
	* The proxy handler for spread props. Handles the incoming array of props
	* that looks like `() => { dynamic: props }, { static: prop }, ..` and wraps
	* them so that the whole thing is passed to the component as the `$$props` argument.
	* @type {ProxyHandler<{ props: Array<Record<string | symbol, unknown> | (() => Record<string | symbol, unknown>)> }>}}
	*/
	var spread_props_handler = {
		get(target, key) {
			let i = target.props.length;
			while (i--) {
				let p = target.props[i];
				if (is_function(p)) p = p();
				if (typeof p === "object" && p !== null && key in p) return p[key];
			}
		},
		set(target, key, value) {
			let i = target.props.length;
			while (i--) {
				let p = target.props[i];
				if (is_function(p)) p = p();
				const desc = get_descriptor(p, key);
				if (desc && desc.set) {
					desc.set(value);
					return true;
				}
			}
			return false;
		},
		getOwnPropertyDescriptor(target, key) {
			let i = target.props.length;
			while (i--) {
				let p = target.props[i];
				if (is_function(p)) p = p();
				if (typeof p === "object" && p !== null && key in p) {
					const descriptor = get_descriptor(p, key);
					if (descriptor && !descriptor.configurable) descriptor.configurable = true;
					return descriptor;
				}
			}
		},
		has(target, key) {
			if (key === STATE_SYMBOL || key === LEGACY_PROPS) return false;
			for (let p of target.props) {
				if (is_function(p)) p = p();
				if (p != null && key in p) return true;
			}
			return false;
		},
		ownKeys(target) {
			/** @type {Array<string | symbol>} */
			const keys = [];
			for (let p of target.props) {
				if (is_function(p)) p = p();
				if (!p) continue;
				for (const key in p) if (!keys.includes(key)) keys.push(key);
				for (const key of Object.getOwnPropertySymbols(p)) if (!keys.includes(key)) keys.push(key);
			}
			return keys;
		}
	};
	/**
	* @param {Array<Record<string, unknown> | (() => Record<string, unknown>)>} props
	* @returns {any}
	*/
	function spread_props(...props) {
		return new Proxy({ props }, spread_props_handler);
	}
	/**
	* This function is responsible for synchronizing a possibly bound prop with the inner component state.
	* It is used whenever the compiler sees that the component writes to the prop, or when it has a default prop_value.
	* @template V
	* @param {Record<string, unknown>} props
	* @param {string} key
	* @param {number} flags
	* @param {V | (() => V)} [fallback]
	* @returns {(() => V | ((arg: V) => V) | ((arg: V, mutation: boolean) => V))}
	*/
	function prop(props, key, flags, fallback) {
		var runes = !legacy_mode_flag || (flags & 2) !== 0;
		var bindable = (flags & 8) !== 0;
		var lazy = (flags & 16) !== 0;
		var fallback_value = fallback;
		var fallback_dirty = true;
		var fallback_signal = void 0;
		var get_fallback = () => {
			if (lazy && runes) {
				fallback_signal ??= /* @__PURE__ */ derived(fallback);
				return get$2(fallback_signal);
			}
			if (fallback_dirty) {
				fallback_dirty = false;
				fallback_value = lazy ? untrack(fallback) : fallback;
			}
			return fallback_value;
		};
		/** @type {((v: V) => void) | undefined} */
		let setter;
		if (bindable) {
			var is_entry_props = STATE_SYMBOL in props || LEGACY_PROPS in props;
			setter = get_descriptor(props, key)?.set ?? (is_entry_props && key in props ? (v) => props[key] = v : void 0);
		}
		/** @type {V} */
		var initial_value;
		var is_store_sub = false;
		if (bindable) [initial_value, is_store_sub] = capture_store_binding(() => props[key]);
		else initial_value = props[key];
		if (initial_value === void 0 && fallback !== void 0) {
			initial_value = get_fallback();
			if (setter) {
				if (runes) props_invalid_value(key);
				setter(initial_value);
			}
		}
		/** @type {() => V} */
		var getter;
		if (runes) getter = () => {
			var value = props[key];
			if (value === void 0) return get_fallback();
			fallback_dirty = true;
			return value;
		};
		else getter = () => {
			var value = props[key];
			if (value !== void 0) fallback_value = void 0;
			return value === void 0 ? fallback_value : value;
		};
		if (runes && (flags & 4) === 0) return getter;
		if (setter) {
			var legacy_parent = props.$$legacy;
			return (function(value, mutation) {
				if (arguments.length > 0) {
					if (!runes || !mutation || legacy_parent || is_store_sub)
 /** @type {Function} */ setter(mutation ? getter() : value);
					return value;
				}
				return getter();
			});
		}
		var overridden = false;
		var d = ((flags & 1) !== 0 ? derived : derived_safe_equal)(() => {
			overridden = false;
			return getter();
		});
		if (bindable) get$2(d);
		var parent_effect = active_effect;
		return (function(value, mutation) {
			if (arguments.length > 0) {
				const new_value = mutation ? get$2(d) : runes && bindable ? proxy(value) : value;
				set(d, new_value);
				overridden = true;
				if (fallback_value !== void 0) fallback_value = new_value;
				return value;
			}
			if (is_destroying_effect && overridden || (parent_effect.f & 16384) !== 0) return d.v;
			return get$2(d);
		});
	}
	if (typeof HTMLElement === "function");
	/**
	* `onMount`, like [`$effect`](https://svelte.dev/docs/svelte/$effect), schedules a function to run as soon as the component has been mounted to the DOM.
	* Unlike `$effect`, the provided function only runs once.
	*
	* It must be called during the component's initialisation (but doesn't need to live _inside_ the component;
	* it can be called from an external module). If a function is returned _synchronously_ from `onMount`,
	* it will be called when the component is unmounted.
	*
	* `onMount` functions do not run during [server-side rendering](https://svelte.dev/docs/svelte/svelte-server#render).
	*
	* @template T
	* @param {() => NotFunction<T> | Promise<NotFunction<T>> | (() => any)} fn
	* @returns {void}
	*/
	function onMount(fn) {
		if (component_context === null) lifecycle_outside_component("onMount");
		if (legacy_mode_flag && component_context.l !== null) init_update_callbacks(component_context).m.push(fn);
		else user_effect(() => {
			const cleanup = untrack(fn);
			if (typeof cleanup === "function") return cleanup;
		});
	}
	/**
	* Legacy-mode: Init callbacks object for onMount/beforeUpdate/afterUpdate
	* @param {ComponentContext} context
	*/
	function init_update_callbacks(context) {
		var l = context.l;
		return l.u ??= {
			a: [],
			b: [],
			m: []
		};
	}
	//#endregion
	//#region node_modules/svelte/src/internal/disclose-version.js
	if (typeof window !== "undefined") ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/is.js
	function isFunction$1(value) {
		return typeof value === "function";
	}
	function isObject(value) {
		return value !== null && typeof value === "object";
	}
	var CLASS_VALUE_PRIMITIVE_TYPES = [
		"string",
		"number",
		"bigint",
		"boolean"
	];
	function isClassValue(value) {
		if (value === null || value === void 0) return true;
		if (CLASS_VALUE_PRIMITIVE_TYPES.includes(typeof value)) return true;
		if (Array.isArray(value)) return value.every((item) => isClassValue(item));
		if (typeof value === "object") {
			if (Object.getPrototypeOf(value) !== Object.prototype) return false;
			return true;
		}
		return false;
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/box/box-extras.svelte.js
	var BoxSymbol = Symbol("box");
	var isWritableSymbol = Symbol("is-writable");
	function boxWith(getter, setter) {
		const derived = /* @__PURE__ */ user_derived(getter);
		if (setter) return {
			[BoxSymbol]: true,
			[isWritableSymbol]: true,
			get current() {
				return get$2(derived);
			},
			set current(v) {
				setter(v);
			}
		};
		return {
			[BoxSymbol]: true,
			get current() {
				return getter();
			}
		};
	}
	/**
	* @returns Whether the value is a Box
	*
	* @see {@link https://runed.dev/docs/functions/box}
	*/
	function isBox(value) {
		return isObject(value) && BoxSymbol in value;
	}
	/**
	* @returns Whether the value is a WritableBox
	*
	* @see {@link https://runed.dev/docs/functions/box}
	*/
	function isWritableBox(value) {
		return isBox(value) && isWritableSymbol in value;
	}
	function boxFrom(value) {
		if (isBox(value)) return value;
		if (isFunction$1(value)) return boxWith(value);
		return simpleBox(value);
	}
	/**
	* Function that gets an object of boxes, and returns an object of reactive values
	*
	* @example
	* const count = box(0)
	* const flat = box.flatten({ count, double: box.with(() => count.current) })
	* // type of flat is { count: number, readonly double: number }
	*
	* @see {@link https://runed.dev/docs/functions/box}
	*/
	function boxFlatten(boxes) {
		return Object.entries(boxes).reduce((acc, [key, b]) => {
			if (!isBox(b)) return Object.assign(acc, { [key]: b });
			if (isWritableBox(b)) Object.defineProperty(acc, key, {
				get() {
					return b.current;
				},
				set(v) {
					b.current = v;
				}
			});
			else Object.defineProperty(acc, key, { get() {
				return b.current;
			} });
			return acc;
		}, {});
	}
	/**
	* Function that converts a box to a readonly box.
	*
	* @example
	* const count = box(0) // WritableBox<number>
	* const countReadonly = box.readonly(count) // ReadableBox<number>
	*
	* @see {@link https://runed.dev/docs/functions/box}
	*/
	function toReadonlyBox(b) {
		if (!isWritableBox(b)) return b;
		return {
			[BoxSymbol]: true,
			get current() {
				return b.current;
			}
		};
	}
	function simpleBox(initialValue) {
		let current = /* @__PURE__ */ state(proxy(initialValue));
		return {
			[BoxSymbol]: true,
			[isWritableSymbol]: true,
			get current() {
				return get$2(current);
			},
			set current(v) {
				set(current, v, true);
			}
		};
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/box/box.svelte.js
	function box(initialValue) {
		let current = /* @__PURE__ */ state(proxy(initialValue));
		return {
			[BoxSymbol]: true,
			[isWritableSymbol]: true,
			get current() {
				return get$2(current);
			},
			set current(v) {
				set(current, v, true);
			}
		};
	}
	box.from = boxFrom;
	box.with = boxWith;
	box.flatten = boxFlatten;
	box.readonly = toReadonlyBox;
	box.isBox = isBox;
	box.isWritableBox = isWritableBox;
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/compose-handlers.js
	/**
	* Composes event handlers into a single function that can be called with an event.
	* If the previous handler cancels the event using `event.preventDefault()`, the handlers
	* that follow will not be called.
	*/
	function composeHandlers(...handlers) {
		return function(e) {
			for (const handler of handlers) {
				if (!handler) continue;
				if (e.defaultPrevented) return;
				if (typeof handler === "function") handler.call(this, e);
				else handler.current?.call(this, e);
			}
		};
	}
	//#endregion
	//#region node_modules/inline-style-parser/esm/index.mjs
	var COMMENT_REGEX = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g;
	var NEWLINE_REGEX = /\n/g;
	var WHITESPACE_REGEX = /^\s*/;
	var PROPERTY_REGEX = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/;
	var COLON_REGEX = /^:\s*/;
	var VALUE_REGEX = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/;
	var SEMICOLON_REGEX = /^[;\s]*/;
	var TRIM_REGEX = /^\s+|\s+$/g;
	var NEWLINE = "\n";
	var FORWARD_SLASH = "/";
	var ASTERISK = "*";
	var EMPTY_STRING = "";
	var TYPE_COMMENT = "comment";
	var TYPE_DECLARATION = "declaration";
	/**
	* @param {String} style
	* @param {Object} [options]
	* @return {Object[]}
	* @throws {TypeError}
	* @throws {Error}
	*/
	function index(style, options) {
		if (typeof style !== "string") throw new TypeError("First argument must be a string");
		if (!style) return [];
		options = options || {};
		/**
		* Positional.
		*/
		var lineno = 1;
		var column = 1;
		/**
		* Update lineno and column based on `str`.
		*
		* @param {String} str
		*/
		function updatePosition(str) {
			var lines = str.match(NEWLINE_REGEX);
			if (lines) lineno += lines.length;
			var i = str.lastIndexOf(NEWLINE);
			column = ~i ? str.length - i : column + str.length;
		}
		/**
		* Mark position and patch `node.position`.
		*
		* @return {Function}
		*/
		function position() {
			var start = {
				line: lineno,
				column
			};
			return function(node) {
				node.position = new Position(start);
				whitespace();
				return node;
			};
		}
		/**
		* Store position information for a node.
		*
		* @constructor
		* @property {Object} start
		* @property {Object} end
		* @property {undefined|String} source
		*/
		function Position(start) {
			this.start = start;
			this.end = {
				line: lineno,
				column
			};
			this.source = options.source;
		}
		/**
		* Non-enumerable source string.
		*/
		Position.prototype.content = style;
		/**
		* Error `msg`.
		*
		* @param {String} msg
		* @throws {Error}
		*/
		function error(msg) {
			var err = /* @__PURE__ */ new Error(options.source + ":" + lineno + ":" + column + ": " + msg);
			err.reason = msg;
			err.filename = options.source;
			err.line = lineno;
			err.column = column;
			err.source = style;
			if (options.silent);
			else throw err;
		}
		/**
		* Match `re` and return captures.
		*
		* @param {RegExp} re
		* @return {undefined|Array}
		*/
		function match(re) {
			var m = re.exec(style);
			if (!m) return;
			var str = m[0];
			updatePosition(str);
			style = style.slice(str.length);
			return m;
		}
		/**
		* Parse whitespace.
		*/
		function whitespace() {
			match(WHITESPACE_REGEX);
		}
		/**
		* Parse comments.
		*
		* @param {Object[]} [rules]
		* @return {Object[]}
		*/
		function comments(rules) {
			var c;
			rules = rules || [];
			while (c = comment()) if (c !== false) rules.push(c);
			return rules;
		}
		/**
		* Parse comment.
		*
		* @return {Object}
		* @throws {Error}
		*/
		function comment() {
			var pos = position();
			if (FORWARD_SLASH != style.charAt(0) || ASTERISK != style.charAt(1)) return;
			var i = 2;
			while (EMPTY_STRING != style.charAt(i) && (ASTERISK != style.charAt(i) || FORWARD_SLASH != style.charAt(i + 1))) ++i;
			i += 2;
			if (EMPTY_STRING === style.charAt(i - 1)) return error("End of comment missing");
			var str = style.slice(2, i - 2);
			column += 2;
			updatePosition(str);
			style = style.slice(i);
			column += 2;
			return pos({
				type: TYPE_COMMENT,
				comment: str
			});
		}
		/**
		* Parse declaration.
		*
		* @return {Object}
		* @throws {Error}
		*/
		function declaration() {
			var pos = position();
			var prop = match(PROPERTY_REGEX);
			if (!prop) return;
			comment();
			if (!match(COLON_REGEX)) return error("property missing ':'");
			var val = match(VALUE_REGEX);
			var ret = pos({
				type: TYPE_DECLARATION,
				property: trim(prop[0].replace(COMMENT_REGEX, EMPTY_STRING)),
				value: val ? trim(val[0].replace(COMMENT_REGEX, EMPTY_STRING)) : EMPTY_STRING
			});
			match(SEMICOLON_REGEX);
			return ret;
		}
		/**
		* Parse declarations.
		*
		* @return {Object[]}
		*/
		function declarations() {
			var decls = [];
			comments(decls);
			var decl;
			while (decl = declaration()) if (decl !== false) {
				decls.push(decl);
				comments(decls);
			}
			return decls;
		}
		whitespace();
		return declarations();
	}
	/**
	* Trim `str`.
	*
	* @param {String} str
	* @return {String}
	*/
	function trim(str) {
		return str ? str.replace(TRIM_REGEX, EMPTY_STRING) : EMPTY_STRING;
	}
	//#endregion
	//#region node_modules/style-to-object/esm/index.mjs
	/**
	* Parses inline style to object.
	*
	* @param style - Inline style.
	* @param iterator - Iterator.
	* @returns - Style object or null.
	*
	* @example Parsing inline style to object:
	*
	* ```js
	* import parse from 'style-to-object';
	* parse('line-height: 42;'); // { 'line-height': '42' }
	* ```
	*/
	function StyleToObject(style, iterator) {
		let styleObject = null;
		if (!style || typeof style !== "string") return styleObject;
		const declarations = index(style);
		const hasIterator = typeof iterator === "function";
		declarations.forEach((declaration) => {
			if (declaration.type !== "declaration") return;
			const { property, value } = declaration;
			if (hasIterator) iterator(property, value, declaration);
			else if (value) {
				styleObject = styleObject || {};
				styleObject[property] = value;
			}
		});
		return styleObject;
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/strings.js
	var NUMBER_CHAR_RE = /\d/;
	var STR_SPLITTERS = [
		"-",
		"_",
		"/",
		"."
	];
	function isUppercase(char = "") {
		if (NUMBER_CHAR_RE.test(char)) return void 0;
		return char !== char.toLowerCase();
	}
	function splitByCase(str) {
		const parts = [];
		let buff = "";
		let previousUpper;
		let previousSplitter;
		for (const char of str) {
			const isSplitter = STR_SPLITTERS.includes(char);
			if (isSplitter === true) {
				parts.push(buff);
				buff = "";
				previousUpper = void 0;
				continue;
			}
			const isUpper = isUppercase(char);
			if (previousSplitter === false) {
				if (previousUpper === false && isUpper === true) {
					parts.push(buff);
					buff = char;
					previousUpper = isUpper;
					continue;
				}
				if (previousUpper === true && isUpper === false && buff.length > 1) {
					const lastChar = buff.at(-1);
					parts.push(buff.slice(0, Math.max(0, buff.length - 1)));
					buff = lastChar + char;
					previousUpper = isUpper;
					continue;
				}
			}
			buff += char;
			previousUpper = isUpper;
			previousSplitter = isSplitter;
		}
		parts.push(buff);
		return parts;
	}
	function pascalCase(str) {
		if (!str) return "";
		return splitByCase(str).map((p) => upperFirst(p)).join("");
	}
	function camelCase(str) {
		return lowerFirst(pascalCase(str || ""));
	}
	function upperFirst(str) {
		return str ? str[0].toUpperCase() + str.slice(1) : "";
	}
	function lowerFirst(str) {
		return str ? str[0].toLowerCase() + str.slice(1) : "";
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/css-to-style-obj.js
	function cssToStyleObj(css) {
		if (!css) return {};
		const styleObj = {};
		function iterator(name, value) {
			if (name.startsWith("-moz-") || name.startsWith("-webkit-") || name.startsWith("-ms-") || name.startsWith("-o-")) {
				styleObj[pascalCase(name)] = value;
				return;
			}
			if (name.startsWith("--")) {
				styleObj[name] = value;
				return;
			}
			styleObj[camelCase(name)] = value;
		}
		StyleToObject(css, iterator);
		return styleObj;
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/execute-callbacks.js
	/**
	* Executes an array of callback functions with the same arguments.
	* @template T The types of the arguments that the callback functions take.
	* @param callbacks array of callback functions to execute.
	* @returns A new function that executes all of the original callback functions with the same arguments.
	*/
	function executeCallbacks(...callbacks) {
		return (...args) => {
			for (const callback of callbacks) if (typeof callback === "function") callback(...args);
		};
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/style-to-css.js
	function createParser(matcher, replacer) {
		const regex = RegExp(matcher, "g");
		return (str) => {
			if (typeof str !== "string") throw new TypeError(`expected an argument of type string, but got ${typeof str}`);
			if (!str.match(regex)) return str;
			return str.replace(regex, replacer);
		};
	}
	var camelToKebab = createParser(/[A-Z]/, (match) => `-${match.toLowerCase()}`);
	function styleToCSS(styleObj) {
		if (!styleObj || typeof styleObj !== "object" || Array.isArray(styleObj)) throw new TypeError(`expected an argument of type object, but got ${typeof styleObj}`);
		return Object.keys(styleObj).map((property) => `${camelToKebab(property)}: ${styleObj[property]};`).join("\n");
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/style.js
	function styleToString(style = {}) {
		return styleToCSS(style).replace("\n", " ");
	}
	var EVENT_LIST_SET = /* @__PURE__ */ new Set([
		"onabort",
		"onanimationcancel",
		"onanimationend",
		"onanimationiteration",
		"onanimationstart",
		"onauxclick",
		"onbeforeinput",
		"onbeforetoggle",
		"onblur",
		"oncancel",
		"oncanplay",
		"oncanplaythrough",
		"onchange",
		"onclick",
		"onclose",
		"oncompositionend",
		"oncompositionstart",
		"oncompositionupdate",
		"oncontextlost",
		"oncontextmenu",
		"oncontextrestored",
		"oncopy",
		"oncuechange",
		"oncut",
		"ondblclick",
		"ondrag",
		"ondragend",
		"ondragenter",
		"ondragleave",
		"ondragover",
		"ondragstart",
		"ondrop",
		"ondurationchange",
		"onemptied",
		"onended",
		"onerror",
		"onfocus",
		"onfocusin",
		"onfocusout",
		"onformdata",
		"ongotpointercapture",
		"oninput",
		"oninvalid",
		"onkeydown",
		"onkeypress",
		"onkeyup",
		"onload",
		"onloadeddata",
		"onloadedmetadata",
		"onloadstart",
		"onlostpointercapture",
		"onmousedown",
		"onmouseenter",
		"onmouseleave",
		"onmousemove",
		"onmouseout",
		"onmouseover",
		"onmouseup",
		"onpaste",
		"onpause",
		"onplay",
		"onplaying",
		"onpointercancel",
		"onpointerdown",
		"onpointerenter",
		"onpointerleave",
		"onpointermove",
		"onpointerout",
		"onpointerover",
		"onpointerup",
		"onprogress",
		"onratechange",
		"onreset",
		"onresize",
		"onscroll",
		"onscrollend",
		"onsecuritypolicyviolation",
		"onseeked",
		"onseeking",
		"onselect",
		"onselectionchange",
		"onselectstart",
		"onslotchange",
		"onstalled",
		"onsubmit",
		"onsuspend",
		"ontimeupdate",
		"ontoggle",
		"ontouchcancel",
		"ontouchend",
		"ontouchmove",
		"ontouchstart",
		"ontransitioncancel",
		"ontransitionend",
		"ontransitionrun",
		"ontransitionstart",
		"onvolumechange",
		"onwaiting",
		"onwebkitanimationend",
		"onwebkitanimationiteration",
		"onwebkitanimationstart",
		"onwebkittransitionend",
		"onwheel"
	]);
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/merge-props.js
	/**
	* Modified from https://github.com/adobe/react-spectrum/blob/main/packages/%40react-aria/utils/src/mergeProps.ts (see NOTICE.txt for source)
	*/
	function isEventHandler(key) {
		return EVENT_LIST_SET.has(key);
	}
	/**
	* Given a list of prop objects, merges them into a single object.
	* - Automatically composes event handlers (e.g. `onclick`, `oninput`, etc.)
	* - Chains regular functions with the same name so they are called in order
	* - Merges class strings with `clsx`
	* - Merges style objects and converts them to strings
	* - Handles a bug with Svelte where setting the `hidden` attribute to `false` doesn't remove it
	* - Overrides other values with the last one
	*/
	function mergeProps(...args) {
		const result = { ...args[0] };
		for (let i = 1; i < args.length; i++) {
			const props = args[i];
			if (!props) continue;
			for (const key of Object.keys(props)) {
				const a = result[key];
				const b = props[key];
				const aIsFunction = typeof a === "function";
				const bIsFunction = typeof b === "function";
				if (aIsFunction && typeof bIsFunction && isEventHandler(key)) result[key] = composeHandlers(a, b);
				else if (aIsFunction && bIsFunction) result[key] = executeCallbacks(a, b);
				else if (key === "class") {
					const aIsClassValue = isClassValue(a);
					const bIsClassValue = isClassValue(b);
					if (aIsClassValue && bIsClassValue) result[key] = clsx$1(a, b);
					else if (aIsClassValue) result[key] = clsx$1(a);
					else if (bIsClassValue) result[key] = clsx$1(b);
				} else if (key === "style") {
					const aIsObject = typeof a === "object";
					const bIsObject = typeof b === "object";
					const aIsString = typeof a === "string";
					const bIsString = typeof b === "string";
					if (aIsObject && bIsObject) result[key] = {
						...a,
						...b
					};
					else if (aIsObject && bIsString) {
						const parsedStyle = cssToStyleObj(b);
						result[key] = {
							...a,
							...parsedStyle
						};
					} else if (aIsString && bIsObject) result[key] = {
						...cssToStyleObj(a),
						...b
					};
					else if (aIsString && bIsString) {
						const parsedStyleA = cssToStyleObj(a);
						const parsedStyleB = cssToStyleObj(b);
						result[key] = {
							...parsedStyleA,
							...parsedStyleB
						};
					} else if (aIsObject) result[key] = a;
					else if (bIsObject) result[key] = b;
					else if (aIsString) result[key] = a;
					else if (bIsString) result[key] = b;
				} else result[key] = b !== void 0 ? b : a;
			}
			for (const key of Object.getOwnPropertySymbols(props)) {
				const a = result[key];
				const b = props[key];
				result[key] = b !== void 0 ? b : a;
			}
		}
		if (typeof result.style === "object") result.style = styleToString(result.style).replaceAll("\n", " ");
		if (result.hidden === false) {
			result.hidden = void 0;
			delete result.hidden;
		}
		if (result.disabled === false) {
			result.disabled = void 0;
			delete result.disabled;
		}
		return result;
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/sr-only-styles.js
	var srOnlyStyles = {
		position: "absolute",
		width: "1px",
		height: "1px",
		padding: "0",
		margin: "-1px",
		overflow: "hidden",
		clip: "rect(0, 0, 0, 0)",
		whiteSpace: "nowrap",
		borderWidth: "0",
		transform: "translateX(-100%)"
	};
	styleToString(srOnlyStyles);
	//#endregion
	//#region node_modules/runed/dist/internal/configurable-globals.js
	var defaultWindow = typeof window !== "undefined" ? window : void 0;
	typeof window !== "undefined" && window.document;
	typeof window !== "undefined" && window.navigator;
	typeof window !== "undefined" && window.location;
	//#endregion
	//#region node_modules/runed/dist/internal/utils/dom.js
	/**
	* Handles getting the active element in a document or shadow root.
	* If the active element is within a shadow root, it will traverse the shadow root
	* to find the active element.
	* If not, it will return the active element in the document.
	*
	* @param document A document or shadow root to get the active element from.
	* @returns The active element in the document or shadow root.
	*/
	function getActiveElement$1(document) {
		let activeElement = document.activeElement;
		while (activeElement?.shadowRoot) {
			const node = activeElement.shadowRoot.activeElement;
			if (node === activeElement) break;
			else activeElement = node;
		}
		return activeElement;
	}
	//#endregion
	//#region node_modules/svelte/src/reactivity/map.js
	/** @import { Source } from '#client' */
	/**
	* A reactive version of the built-in [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) object.
	* Reading contents of the map (by iterating, or by reading `map.size` or calling `map.get(...)` or `map.has(...)` as in the [tic-tac-toe example](https://svelte.dev/playground/0b0ff4aa49c9443f9b47fe5203c78293) below) in an [effect](https://svelte.dev/docs/svelte/$effect) or [derived](https://svelte.dev/docs/svelte/$derived)
	* will cause it to be re-evaluated as necessary when the map is updated.
	*
	* Note that values in a reactive map are _not_ made [deeply reactive](https://svelte.dev/docs/svelte/$state#Deep-state).
	*
	* ```svelte
	* <script>
	* 	import { SvelteMap } from 'svelte/reactivity';
	* 	import { result } from './game.js';
	*
	* 	let board = new SvelteMap();
	* 	let player = $state('x');
	* 	let winner = $derived(result(board));
	*
	* 	function reset() {
	* 		player = 'x';
	* 		board.clear();
	* 	}
	* <\/script>
	*
	* <div class="board">
	* 	{#each Array(9), i}
	* 		<button
	* 			disabled={board.has(i) || winner}
	* 			onclick={() => {
	* 				board.set(i, player);
	* 				player = player === 'x' ? 'o' : 'x';
	* 			}}
	* 		>{board.get(i)}</button>
	* 	{/each}
	* </div>
	*
	* {#if winner}
	* 	<p>{winner} wins!</p>
	* 	<button onclick={reset}>reset</button>
	* {:else}
	* 	<p>{player} is next</p>
	* {/if}
	* ```
	*
	* @template K
	* @template V
	* @extends {Map<K, V>}
	*/
	var SvelteMap = class extends Map {
		/** @type {Map<K, Source<number>>} */
		#sources = /* @__PURE__ */ new Map();
		#version = /* @__PURE__ */ state(0);
		#size = /* @__PURE__ */ state(0);
		#update_version = update_version || -1;
		/**
		* @param {Iterable<readonly [K, V]> | null | undefined} [value]
		*/
		constructor(value) {
			super();
			if (value) {
				for (var [key, v] of value) super.set(key, v);
				this.#size.v = super.size;
			}
		}
		/**
		* If the source is being created inside the same reaction as the SvelteMap instance,
		* we use `state` so that it will not be a dependency of the reaction. Otherwise we
		* use `source` so it will be.
		*
		* @template T
		* @param {T} value
		* @returns {Source<T>}
		*/
		#source(value) {
			return update_version === this.#update_version ? /* @__PURE__ */ state(value) : source(value);
		}
		/** @param {K} key */
		has(key) {
			var sources = this.#sources;
			var s = sources.get(key);
			if (s === void 0) {
				if (super.has(key)) {
					s = this.#source(0);
					sources.set(key, s);
				} else {
					get$2(this.#version);
					return false;
				}
			}
			get$2(s);
			return true;
		}
		/**
		* @param {(value: V, key: K, map: Map<K, V>) => void} callbackfn
		* @param {any} [this_arg]
		*/
		forEach(callbackfn, this_arg) {
			this.#read_all();
			super.forEach(callbackfn, this_arg);
		}
		/** @param {K} key */
		get(key) {
			var sources = this.#sources;
			var s = sources.get(key);
			if (s === void 0) {
				if (super.has(key)) {
					s = this.#source(0);
					sources.set(key, s);
				} else {
					get$2(this.#version);
					return;
				}
			}
			get$2(s);
			return super.get(key);
		}
		/**
		* @param {K} key
		* @param {V} value
		* */
		getOrInsert(key, value) {
			if (!super.has(key)) this.set(key, value);
			return this.get(key);
		}
		/**
		* @param {K} key
		* @param {(key: K) => V} callbackFn
		*/
		getOrInsertComputed(key, callbackFn) {
			if (!super.has(key)) this.set(key, callbackFn(key));
			return this.get(key);
		}
		/**
		* @param {K} key
		* @param {V} value
		* */
		set(key, value) {
			var sources = this.#sources;
			var s = sources.get(key);
			var prev_res = super.get(key);
			var res = super.set(key, value);
			var version = this.#version;
			if (s === void 0) {
				s = this.#source(0);
				sources.set(key, s);
				set(this.#size, super.size);
				increment(version);
			} else if (prev_res !== value) {
				increment(s);
				var v_reactions = version.reactions === null ? null : new Set(version.reactions);
				if (v_reactions === null || !s.reactions?.every((r) => v_reactions.has(r))) increment(version);
			}
			return res;
		}
		/** @param {K} key */
		delete(key) {
			var sources = this.#sources;
			var s = sources.get(key);
			var res = super.delete(key);
			if (s !== void 0) {
				sources.delete(key);
				set(s, -1);
			}
			if (res) {
				set(this.#size, super.size);
				increment(this.#version);
			}
			return res;
		}
		clear() {
			if (super.size === 0) return;
			super.clear();
			var sources = this.#sources;
			set(this.#size, 0);
			for (var s of sources.values()) set(s, -1);
			increment(this.#version);
			sources.clear();
		}
		#read_all() {
			get$2(this.#version);
			var sources = this.#sources;
			if (this.#size.v !== sources.size) {
				for (var key of super.keys()) if (!sources.has(key)) {
					var s = this.#source(0);
					sources.set(key, s);
				}
			}
			for ([, s] of this.#sources) get$2(s);
		}
		keys() {
			get$2(this.#version);
			return super.keys();
		}
		values() {
			this.#read_all();
			return super.values();
		}
		entries() {
			this.#read_all();
			return super.entries();
		}
		[Symbol.iterator]() {
			return this.entries();
		}
		get size() {
			get$2(this.#size);
			return super.size;
		}
	};
	//#endregion
	//#region node_modules/runed/dist/utilities/active-element/active-element.svelte.js
	var ActiveElement = class {
		#document;
		#subscribe;
		constructor(options = {}) {
			const { window = defaultWindow, document = window?.document } = options;
			if (window === void 0) return;
			this.#document = document;
			this.#subscribe = createSubscriber((update) => {
				const cleanupFocusIn = on(window, "focusin", update);
				const cleanupFocusOut = on(window, "focusout", update);
				return () => {
					cleanupFocusIn();
					cleanupFocusOut();
				};
			});
		}
		get current() {
			this.#subscribe?.();
			if (!this.#document) return null;
			return getActiveElement$1(this.#document);
		}
	};
	new ActiveElement();
	//#endregion
	//#region node_modules/runed/dist/internal/utils/is.js
	function isFunction(value) {
		return typeof value === "function";
	}
	//#endregion
	//#region node_modules/runed/dist/utilities/context/context.js
	var Context = class {
		#name;
		#key;
		/**
		* @param name The name of the context.
		* This is used for generating the context key and error messages.
		*/
		constructor(name) {
			this.#name = name;
			this.#key = Symbol(name);
		}
		/**
		* The key used to get and set the context.
		*
		* It is not recommended to use this value directly.
		* Instead, use the methods provided by this class.
		*/
		get key() {
			return this.#key;
		}
		/**
		* Checks whether this has been set in the context of a parent component.
		*
		* Must be called during component initialisation.
		*/
		exists() {
			return hasContext(this.#key);
		}
		/**
		* Retrieves the context that belongs to the closest parent component.
		*
		* Must be called during component initialisation.
		*
		* @throws An error if the context does not exist.
		*/
		get() {
			const context = getContext(this.#key);
			if (context === void 0) throw new Error(`Context "${this.#name}" not found`);
			return context;
		}
		/**
		* Retrieves the context that belongs to the closest parent component,
		* or the given fallback value if the context does not exist.
		*
		* Must be called during component initialisation.
		*/
		getOr(fallback) {
			const context = getContext(this.#key);
			if (context === void 0) return fallback;
			return context;
		}
		/**
		* Associates the given value with the current component and returns it.
		*
		* Must be called during component initialisation.
		*/
		set(context) {
			return setContext(this.#key, context);
		}
	};
	//#endregion
	//#region node_modules/runed/dist/utilities/watch/watch.svelte.js
	function runEffect(flush, effect) {
		switch (flush) {
			case "post":
				user_effect(effect);
				break;
			case "pre": user_pre_effect(effect);
		}
	}
	function runWatcher(sources, flush, effect, options = {}) {
		const { lazy = false } = options;
		let active = !lazy;
		let previousValues = Array.isArray(sources) ? [] : void 0;
		runEffect(flush, () => {
			const values = Array.isArray(sources) ? sources.map((source) => source()) : sources();
			if (!active) {
				active = true;
				previousValues = values;
				return;
			}
			const cleanup = untrack(() => effect(values, previousValues));
			previousValues = values;
			return cleanup;
		});
	}
	function runWatcherOnce(sources, flush, effect) {
		const cleanupRoot = effect_root(() => {
			let stop = false;
			runWatcher(sources, flush, (values, previousValues) => {
				if (stop) {
					cleanupRoot();
					return;
				}
				const cleanup = effect(values, previousValues);
				stop = true;
				return cleanup;
			}, { lazy: true });
		});
		user_effect(() => {
			return cleanupRoot;
		});
	}
	function watch(sources, effect, options) {
		runWatcher(sources, "post", effect, options);
	}
	function watchPre(sources, effect, options) {
		runWatcher(sources, "pre", effect, options);
	}
	watch.pre = watchPre;
	function watchOnce(source, effect) {
		runWatcherOnce(source, "post", effect);
	}
	function watchOncePre(source, effect) {
		runWatcherOnce(source, "pre", effect);
	}
	watchOnce.pre = watchOncePre;
	//#endregion
	//#region node_modules/runed/dist/internal/utils/get.js
	function get$1(value) {
		if (isFunction(value)) return value();
		return value;
	}
	//#endregion
	//#region node_modules/runed/dist/utilities/element-size/element-size.svelte.js
	var ElementSize = class {
		#size = {
			width: 0,
			height: 0
		};
		#observed = false;
		#options;
		#node;
		#window;
		#width = /* @__PURE__ */ user_derived(() => {
			get$2(this.#subscribe)?.();
			return this.getSize().width;
		});
		#height = /* @__PURE__ */ user_derived(() => {
			get$2(this.#subscribe)?.();
			return this.getSize().height;
		});
		#subscribe = /* @__PURE__ */ user_derived(() => {
			const node$ = get$1(this.#node);
			if (!node$) return;
			return createSubscriber((update) => {
				if (!this.#window) return;
				const observer = new this.#window.ResizeObserver((entries) => {
					this.#observed = true;
					for (const entry of entries) {
						const boxSize = this.#options.box === "content-box" ? entry.contentBoxSize : entry.borderBoxSize;
						const boxSizeArr = Array.isArray(boxSize) ? boxSize : [boxSize];
						this.#size.width = boxSizeArr.reduce((acc, size) => Math.max(acc, size.inlineSize), 0);
						this.#size.height = boxSizeArr.reduce((acc, size) => Math.max(acc, size.blockSize), 0);
					}
					update();
				});
				observer.observe(node$);
				return () => {
					this.#observed = false;
					observer.disconnect();
				};
			});
		});
		constructor(node, options = { box: "border-box" }) {
			this.#window = options.window ?? defaultWindow;
			this.#options = options;
			this.#node = node;
			this.#size = {
				width: 0,
				height: 0
			};
		}
		calculateSize() {
			const element = get$1(this.#node);
			if (!element || !this.#window) return;
			const offsetWidth = element.offsetWidth;
			const offsetHeight = element.offsetHeight;
			if (this.#options.box === "border-box") return {
				width: offsetWidth,
				height: offsetHeight
			};
			const style = this.#window.getComputedStyle(element);
			const paddingWidth = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
			const paddingHeight = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
			const borderWidth = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
			const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
			return {
				width: offsetWidth - paddingWidth - borderWidth,
				height: offsetHeight - paddingHeight - borderHeight
			};
		}
		getSize() {
			return this.#observed ? this.#size : this.calculateSize() ?? this.#size;
		}
		get current() {
			get$2(this.#subscribe)?.();
			return this.getSize();
		}
		get width() {
			return get$2(this.#width);
		}
		get height() {
			return get$2(this.#height);
		}
	};
	//#endregion
	//#region node_modules/runed/dist/utilities/previous/previous.svelte.js
	var Previous = class {
		#previousCallback = () => void 0;
		#previous = /* @__PURE__ */ user_derived(() => this.#previousCallback());
		constructor(getter, initialValue) {
			let actualPrevious = void 0;
			if (initialValue !== void 0) actualPrevious = initialValue;
			this.#previousCallback = () => {
				try {
					return actualPrevious;
				} finally {
					actualPrevious = getter();
				}
			};
		}
		get current() {
			return get$2(this.#previous);
		}
	};
	//#endregion
	//#region node_modules/runed/dist/utilities/resource/resource.svelte.js
	function debounce$1(fn, delay) {
		let timeoutId;
		let lastResolve = null;
		return (...args) => {
			return new Promise((resolve) => {
				if (lastResolve) lastResolve(void 0);
				lastResolve = resolve;
				clearTimeout(timeoutId);
				timeoutId = setTimeout(async () => {
					const result = await fn(...args);
					if (lastResolve) {
						lastResolve(result);
						lastResolve = null;
					}
				}, delay);
			});
		};
	}
	function throttle(fn, delay) {
		let lastRun = 0;
		let lastPromise = null;
		return (...args) => {
			const now = Date.now();
			if (lastRun && now - lastRun < delay) return lastPromise ?? Promise.resolve(void 0);
			lastRun = now;
			lastPromise = fn(...args);
			return lastPromise;
		};
	}
	function runResource(source, fetcher, options = {}, effectFn) {
		const { lazy = false, once = false, initialValue, debounce: debounceTime, throttle: throttleTime } = options;
		let current = /* @__PURE__ */ state(proxy(initialValue));
		let loading = /* @__PURE__ */ state(false);
		let error = /* @__PURE__ */ state(void 0);
		let cleanupFns = /* @__PURE__ */ state(proxy([]));
		const runCleanup = () => {
			get$2(cleanupFns).forEach((fn) => fn());
			set(cleanupFns, [], true);
		};
		const onCleanup = (fn) => {
			set(cleanupFns, [...get$2(cleanupFns), fn], true);
		};
		const baseFetcher = async (value, previousValue, refetching = false) => {
			try {
				set(loading, true);
				set(error, void 0);
				runCleanup();
				const controller = new AbortController();
				onCleanup(() => controller.abort());
				const result = await fetcher(value, previousValue, {
					data: get$2(current),
					refetching,
					onCleanup,
					signal: controller.signal
				});
				set(current, result, true);
				return result;
			} catch (e) {
				if (!(e instanceof DOMException && e.name === "AbortError")) set(error, e, true);
				return;
			} finally {
				set(loading, false);
			}
		};
		const runFetcher = debounceTime ? debounce$1(baseFetcher, debounceTime) : throttleTime ? throttle(baseFetcher, throttleTime) : baseFetcher;
		const sources = Array.isArray(source) ? source : [source];
		let prevValues;
		effectFn((values, previousValues) => {
			if (once && prevValues) return;
			prevValues = values;
			runFetcher(Array.isArray(source) ? values : values[0], Array.isArray(source) ? previousValues : previousValues?.[0]);
		}, { lazy });
		return {
			get current() {
				return get$2(current);
			},
			get loading() {
				return get$2(loading);
			},
			get error() {
				return get$2(error);
			},
			mutate: (value) => {
				set(current, value, true);
			},
			refetch: (info) => {
				const values = sources.map((s) => s());
				return runFetcher(Array.isArray(source) ? values : values[0], Array.isArray(source) ? values : values[0], info ?? true);
			}
		};
	}
	function resource(source, fetcher, options) {
		return runResource(source, fetcher, options, (fn, options) => {
			const sources = Array.isArray(source) ? source : [source];
			const getters = () => sources.map((s) => s());
			watch(getters, (values, previousValues) => {
				fn(values, previousValues ?? []);
			}, options);
		});
	}
	function resourcePre(source, fetcher, options) {
		return runResource(source, fetcher, options, (fn, options) => {
			const sources = Array.isArray(source) ? source : [source];
			const getter = () => sources.map((s) => s());
			watch.pre(getter, (values, previousValues) => {
				fn(values, previousValues ?? []);
			}, options);
		});
	}
	resource.pre = resourcePre;
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/on-destroy-effect.svelte.js
	function onDestroyEffect(fn) {
		user_effect(() => {
			return () => {
				fn();
			};
		});
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/on-mount-effect.svelte.js
	function onMountEffect(fn) {
		user_effect(() => {
			return untrack(() => fn());
		});
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/after-sleep.js
	/**
	* A utility function that executes a callback after a specified number of milliseconds.
	*/
	function afterSleep(ms, cb) {
		return setTimeout(cb, ms);
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/after-tick.js
	function afterTick(fn) {
		tick().then(fn);
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/dom.js
	var ELEMENT_NODE = 1;
	var DOCUMENT_NODE = 9;
	var DOCUMENT_FRAGMENT_NODE = 11;
	function isHTMLElement$2(node) {
		return isObject(node) && node.nodeType === ELEMENT_NODE && typeof node.nodeName === "string";
	}
	function isDocument(node) {
		return isObject(node) && node.nodeType === DOCUMENT_NODE;
	}
	function isWindow(node) {
		return isObject(node) && node.constructor?.name === "VisualViewport";
	}
	function isNode$1(node) {
		return isObject(node) && node.nodeType !== void 0;
	}
	function isShadowRoot$1(node) {
		return isNode$1(node) && node.nodeType === DOCUMENT_FRAGMENT_NODE && "host" in node;
	}
	function contains(parent, child) {
		if (!parent || !child) return false;
		if (!isHTMLElement$2(parent) || !isHTMLElement$2(child)) return false;
		const rootNode = child.getRootNode?.();
		if (parent === child) return true;
		if (parent.contains(child)) return true;
		if (rootNode && isShadowRoot$1(rootNode)) {
			let next = child;
			while (next) {
				if (parent === next) return true;
				next = next.parentNode || next.host;
			}
		}
		return false;
	}
	function getDocument(node) {
		if (isDocument(node)) return node;
		if (isWindow(node)) return node.document;
		return node?.ownerDocument ?? document;
	}
	function getWindow$1(node) {
		if (isShadowRoot$1(node)) return getWindow$1(node.host);
		if (isDocument(node)) return node.defaultView ?? window;
		if (isHTMLElement$2(node)) return node.ownerDocument?.defaultView ?? window;
		return window;
	}
	function getActiveElement(rootNode) {
		let activeElement = rootNode.activeElement;
		while (activeElement?.shadowRoot) {
			const el = activeElement.shadowRoot.activeElement;
			if (el === activeElement) break;
			else activeElement = el;
		}
		return activeElement;
	}
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/dom-context.svelte.js
	var DOMContext = class {
		element;
		#root = /* @__PURE__ */ user_derived(() => {
			if (!this.element.current) return document;
			return this.element.current.getRootNode() ?? document;
		});
		get root() {
			return get$2(this.#root);
		}
		set root(value) {
			set(this.#root, value);
		}
		constructor(element) {
			if (typeof element === "function") this.element = boxWith(element);
			else this.element = element;
		}
		getDocument = () => {
			return getDocument(this.root);
		};
		getWindow = () => {
			return this.getDocument().defaultView ?? window;
		};
		getActiveElement = () => {
			return getActiveElement(this.root);
		};
		isActiveElement = (node) => {
			return node === this.getActiveElement();
		};
		getElementById(id) {
			return this.root.getElementById(id);
		}
		querySelector = (selector) => {
			if (!this.root) return null;
			return this.root.querySelector(selector);
		};
		querySelectorAll = (selector) => {
			if (!this.root) return [];
			return this.root.querySelectorAll(selector);
		};
		setTimeout = (callback, delay) => {
			return this.getWindow().setTimeout(callback, delay);
		};
		clearTimeout = (timeoutId) => {
			return this.getWindow().clearTimeout(timeoutId);
		};
	};
	//#endregion
	//#region node_modules/svelte-toolbelt/dist/utils/attach-ref.js
	/**
	* Creates a Svelte Attachment that attaches a DOM element to a ref.
	* The ref can be either a WritableBox or a callback function.
	*
	* @param ref - Either a WritableBox to store the element in, or a callback function that receives the element
	* @param onChange - Optional callback that fires when the ref changes
	* @returns An object with a spreadable attachment key that should be spread onto the element
	*
	* @example
	* // Using with WritableBox
	* const ref = box<HTMLDivElement | null>(null);
	* <div {...attachRef(ref)}>Content</div>
	*
	* @example
	* // Using with callback
	* <div {...attachRef((node) => myNode = node)}>Content</div>
	*
	* @example
	* // Using with onChange
	* <div {...attachRef(ref, (node) => console.log(node))}>Content</div>
	*/
	function attachRef(ref, onChange) {
		return { [createAttachmentKey()]: (node) => {
			if (isBox(ref)) {
				ref.current = node;
				untrack(() => onChange?.(node));
				return () => {
					if ("isConnected" in node && node.isConnected) return;
					ref.current = null;
					onChange?.(null);
				};
			}
			ref(node);
			untrack(() => onChange?.(node));
			return () => {
				if ("isConnected" in node && node.isConnected) return;
				ref(null);
				onChange?.(null);
			};
		} };
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/attrs.js
	function boolToStr(condition) {
		return condition ? "true" : "false";
	}
	function boolToEmptyStrOrUndef(condition) {
		return condition ? "" : void 0;
	}
	function boolToTrueOrUndef(condition) {
		return condition ? true : void 0;
	}
	function getDataOpenClosed(condition) {
		return condition ? "open" : "closed";
	}
	function getDataTransitionAttrs(state) {
		if (state === "starting") return { "data-starting-style": "" };
		if (state === "ending") return { "data-ending-style": "" };
		return {};
	}
	var BitsAttrs = class {
		#variant;
		#prefix;
		attrs;
		constructor(config) {
			this.#variant = config.getVariant ? config.getVariant() : null;
			this.#prefix = this.#variant ? `data-${this.#variant}-` : `data-${config.component}-`;
			this.getAttr = this.getAttr.bind(this);
			this.selector = this.selector.bind(this);
			this.attrs = Object.fromEntries(config.parts.map((part) => [part, this.getAttr(part)]));
		}
		getAttr(part, variantOverride) {
			if (variantOverride) return `data-${variantOverride}-${part}`;
			return `${this.#prefix}${part}`;
		}
		selector(part, variantOverride) {
			return `[${this.getAttr(part, variantOverride)}]`;
		}
	};
	function createBitsAttrs(config) {
		const bitsAttrs = new BitsAttrs(config);
		return {
			...bitsAttrs.attrs,
			selector: bitsAttrs.selector,
			getAttr: bitsAttrs.getAttr
		};
	}
	var ARROW_DOWN = "ArrowDown";
	var ARROW_LEFT = "ArrowLeft";
	var ARROW_RIGHT = "ArrowRight";
	var ARROW_UP = "ArrowUp";
	var CAPS_LOCK = "CapsLock";
	var CONTROL = "Control";
	var ENTER = "Enter";
	var ESCAPE = "Escape";
	var HOME = "Home";
	var META = "Meta";
	var PAGE_DOWN = "PageDown";
	var PAGE_UP = "PageUp";
	var SHIFT = "Shift";
	//#endregion
	//#region node_modules/bits-ui/dist/internal/locale.js
	/**
	* Detects the text direction in the element.
	* @returns {Direction} The text direction ('ltr' for left-to-right or 'rtl' for right-to-left).
	*/
	function getElemDirection(elem) {
		return window.getComputedStyle(elem).getPropertyValue("direction");
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/get-directional-keys.js
	var FIRST_KEYS$1 = [
		ARROW_DOWN,
		PAGE_UP,
		HOME
	];
	var LAST_KEYS$1 = [
		ARROW_UP,
		PAGE_DOWN,
		"End"
	];
	[...FIRST_KEYS$1, ...LAST_KEYS$1];
	/**
	* A utility function that returns the next key based on the direction and orientation.
	*/
	function getNextKey(dir = "ltr", orientation = "horizontal") {
		return {
			horizontal: dir === "rtl" ? ARROW_LEFT : ARROW_RIGHT,
			vertical: ARROW_DOWN
		}[orientation];
	}
	/**
	* A utility function that returns the previous key based on the direction and orientation.
	*/
	function getPrevKey(dir = "ltr", orientation = "horizontal") {
		return {
			horizontal: dir === "rtl" ? ARROW_RIGHT : ARROW_LEFT,
			vertical: ARROW_UP
		}[orientation];
	}
	/**
	* A utility function that returns the next and previous keys based on the direction
	* and orientation.
	*/
	function getDirectionalKeys(dir = "ltr", orientation = "horizontal") {
		if (!["ltr", "rtl"].includes(dir)) dir = "ltr";
		if (!["horizontal", "vertical"].includes(orientation)) orientation = "horizontal";
		return {
			nextKey: getNextKey(dir, orientation),
			prevKey: getPrevKey(dir, orientation)
		};
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/is.js
	var isBrowser = typeof document !== "undefined";
	var isIOS = getIsIOS();
	function getIsIOS() {
		return isBrowser && window?.navigator?.userAgent && (/iP(ad|hone|od)/.test(window.navigator.userAgent) || window?.navigator?.maxTouchPoints > 2 && /iPad|Macintosh/.test(window?.navigator.userAgent));
	}
	function isHTMLElement$1(element) {
		return element instanceof HTMLElement;
	}
	function isElement$1(element) {
		return element instanceof Element;
	}
	function isElementOrSVGElement(element) {
		return element instanceof Element || element instanceof SVGElement;
	}
	function isTouch(e) {
		return e.pointerType === "touch";
	}
	function isNotNull(value) {
		return value !== null;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/roving-focus-group.js
	var RovingFocusGroup = class {
		#opts;
		#currentTabStopId = box(null);
		constructor(opts) {
			this.#opts = opts;
		}
		getCandidateNodes() {
			if (!this.#opts.rootNode.current) return [];
			if (this.#opts.candidateSelector) return Array.from(this.#opts.rootNode.current.querySelectorAll(this.#opts.candidateSelector));
			else if (this.#opts.candidateAttr) return Array.from(this.#opts.rootNode.current.querySelectorAll(`[${this.#opts.candidateAttr}]:not([data-disabled])`));
			return [];
		}
		focusFirstCandidate() {
			const items = this.getCandidateNodes();
			if (!items.length) return;
			items[0]?.focus();
		}
		handleKeydown(node, e, both = false) {
			const rootNode = this.#opts.rootNode.current;
			if (!rootNode || !node) return;
			const items = this.getCandidateNodes();
			if (!items.length) return;
			const currentIndex = items.indexOf(node);
			const { nextKey, prevKey } = getDirectionalKeys(getElemDirection(rootNode), this.#opts.orientation.current);
			const loop = this.#opts.loop.current;
			const keyToIndex = {
				[nextKey]: currentIndex + 1,
				[prevKey]: currentIndex - 1,
				[HOME]: 0,
				["End"]: items.length - 1
			};
			if (both) {
				const altNextKey = nextKey === "ArrowDown" ? ARROW_RIGHT : ARROW_DOWN;
				const altPrevKey = prevKey === "ArrowUp" ? ARROW_LEFT : ARROW_UP;
				keyToIndex[altNextKey] = currentIndex + 1;
				keyToIndex[altPrevKey] = currentIndex - 1;
			}
			let itemIndex = keyToIndex[e.key];
			if (itemIndex === void 0) return;
			e.preventDefault();
			if (itemIndex < 0 && loop) itemIndex = items.length - 1;
			else if (itemIndex === items.length && loop) itemIndex = 0;
			const itemToFocus = items[itemIndex];
			if (!itemToFocus) return;
			itemToFocus.focus();
			this.#currentTabStopId.current = itemToFocus.id;
			this.#opts.onCandidateFocus?.(itemToFocus);
			return itemToFocus;
		}
		getTabIndex(node) {
			const items = this.getCandidateNodes();
			const anyActive = this.#currentTabStopId.current !== null;
			if (node && !anyActive && items[0] === node) {
				this.#currentTabStopId.current = node.id;
				return 0;
			} else if (node?.id === this.#currentTabStopId.current) return 0;
			return -1;
		}
		setCurrentTabStopId(id) {
			this.#currentTabStopId.current = id;
		}
		focusCurrentTabStop() {
			const currentTabStopId = this.#currentTabStopId.current;
			if (!currentTabStopId) return;
			const currentTabStop = this.#opts.rootNode.current?.querySelector(`#${currentTabStopId}`);
			if (!currentTabStop || !isHTMLElement$1(currentTabStop)) return;
			currentTabStop.focus();
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/animations-complete.js
	var AnimationsComplete = class {
		#opts;
		#currentFrame = null;
		#observer = null;
		#runId = 0;
		constructor(opts) {
			this.#opts = opts;
			onDestroyEffect(() => this.#cleanup());
		}
		#cleanup() {
			if (this.#currentFrame !== null) {
				window.cancelAnimationFrame(this.#currentFrame);
				this.#currentFrame = null;
			}
			this.#observer?.disconnect();
			this.#observer = null;
			this.#runId++;
		}
		run(fn) {
			this.#cleanup();
			const node = this.#opts.ref.current;
			if (!node) return;
			if (typeof node.getAnimations !== "function") {
				this.#executeCallback(fn);
				return;
			}
			const runId = this.#runId;
			const executeIfCurrent = () => {
				if (runId !== this.#runId) return;
				this.#executeCallback(fn);
			};
			const waitForAnimations = () => {
				if (runId !== this.#runId) return;
				const animations = node.getAnimations();
				if (animations.length === 0) {
					executeIfCurrent();
					return;
				}
				Promise.all(animations.map((animation) => animation.finished)).then(() => {
					executeIfCurrent();
				}).catch(() => {
					if (runId !== this.#runId) return;
					if (node.getAnimations().some((animation) => animation.pending || animation.playState !== "finished")) {
						waitForAnimations();
						return;
					}
					executeIfCurrent();
				});
			};
			const requestWaitForAnimations = () => {
				this.#currentFrame = window.requestAnimationFrame(() => {
					this.#currentFrame = null;
					waitForAnimations();
				});
			};
			if (!this.#opts.afterTick.current) {
				requestWaitForAnimations();
				return;
			}
			this.#currentFrame = window.requestAnimationFrame(() => {
				this.#currentFrame = null;
				const startingStyleAttr = "data-starting-style";
				if (!node.hasAttribute(startingStyleAttr)) {
					requestWaitForAnimations();
					return;
				}
				this.#observer = new MutationObserver(() => {
					if (runId !== this.#runId) return;
					if (node.hasAttribute(startingStyleAttr)) return;
					this.#observer?.disconnect();
					this.#observer = null;
					requestWaitForAnimations();
				});
				this.#observer.observe(node, {
					attributes: true,
					attributeFilter: [startingStyleAttr]
				});
			});
		}
		#executeCallback(fn) {
			const execute = () => {
				fn();
			};
			if (this.#opts.afterTick) afterTick(execute);
			else execute();
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/presence-manager.svelte.js
	var PresenceManager = class {
		#opts;
		#enabled;
		#afterAnimations;
		#shouldRender = /* @__PURE__ */ state(false);
		#transitionStatus = /* @__PURE__ */ state(void 0);
		#hasMounted = false;
		#transitionFrame = null;
		constructor(opts) {
			this.#opts = opts;
			set(this.#shouldRender, opts.open.current, true);
			this.#enabled = opts.enabled ?? true;
			this.#afterAnimations = new AnimationsComplete({
				ref: this.#opts.ref,
				afterTick: this.#opts.open
			});
			onDestroyEffect(() => this.#clearTransitionFrame());
			watch(() => this.#opts.open.current, (isOpen) => {
				if (!this.#hasMounted) {
					this.#hasMounted = true;
					return;
				}
				this.#clearTransitionFrame();
				if (!isOpen && this.#opts.shouldSkipExitAnimation?.()) {
					set(this.#shouldRender, false);
					set(this.#transitionStatus, void 0);
					this.#opts.onComplete?.();
					return;
				}
				if (isOpen) set(this.#shouldRender, true);
				set(this.#transitionStatus, isOpen ? "starting" : "ending", true);
				if (isOpen) this.#transitionFrame = window.requestAnimationFrame(() => {
					this.#transitionFrame = null;
					if (this.#opts.open.current) set(this.#transitionStatus, void 0);
				});
				if (!this.#enabled) {
					if (!isOpen) set(this.#shouldRender, false);
					set(this.#transitionStatus, void 0);
					this.#opts.onComplete?.();
					return;
				}
				this.#afterAnimations.run(() => {
					if (isOpen === this.#opts.open.current) {
						if (!this.#opts.open.current) set(this.#shouldRender, false);
						set(this.#transitionStatus, void 0);
						this.#opts.onComplete?.();
					}
				});
			});
		}
		get shouldRender() {
			return get$2(this.#shouldRender);
		}
		get transitionStatus() {
			return get$2(this.#transitionStatus);
		}
		#clearTransitionFrame() {
			if (this.#transitionFrame === null) return;
			window.cancelAnimationFrame(this.#transitionFrame);
			this.#transitionFrame = null;
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/noop.js
	/**
	* A no operation function (does nothing)
	*/
	function noop() {}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/create-id.js
	function createId(prefixOrUid, uid) {
		if (uid === void 0) return `bits-${prefixOrUid}`;
		return `bits-${prefixOrUid}-${uid}`;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/portal/portal-consumer.svelte
	function Portal_consumer($$anchor, $$props) {
		var fragment = comment();
		key(first_child(fragment), () => $$props.children, ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.children ?? noop$1);
			append($$anchor, fragment_1);
		});
		append($$anchor, fragment);
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/config/bits-config.js
	var BitsConfigContext = new Context("BitsConfig");
	/**
	* Gets the current Bits UI configuration state from the context.
	*
	* Returns a default configuration (where all values are `undefined`) if no configuration is found.
	*/
	function getBitsConfig() {
		const fallback = new BitsConfigState(null, {});
		return BitsConfigContext.getOr(fallback).opts;
	}
	/**
	* Creates and sets a new Bits UI configuration state that inherits from parent configs.
	*
	* @param opts - Configuration options for this level
	* @returns The configuration state instance
	*
	* @example
	* ```typescript
	* // In a component that wants to set a default portal target
	* const config = useBitsConfig({ defaultPortalTo: box("#some-element") });
	*
	* // Child components will inherit this config and can override specific values
	* const childConfig = useBitsConfig({ someOtherProp: box("value") });
	* // childConfig still has defaultPortalTo="#some-element" from parent
	* ```
	*/
	function useBitsConfig(opts) {
		return BitsConfigContext.set(new BitsConfigState(BitsConfigContext.getOr(null), opts));
	}
	/**
	* Configuration state that inherits from parent configurations.
	*
	* @example
	* Config resolution:
	* ```
	* Level 1: { defaultPortalTo: "#some-element", theme: "dark" }
	* Level 2: { spacing: "large" } // inherits defaultPortalTo="#some-element", theme="dark"
	* Level 3: { theme: "light" }   // inherits defaultPortalTo="#some-element", spacing="large", overrides theme="light"
	* ```
	*/
	var BitsConfigState = class {
		opts;
		constructor(parent, opts) {
			const resolveConfigOption = createConfigResolver(parent, opts);
			this.opts = {
				defaultPortalTo: resolveConfigOption((config) => config.defaultPortalTo),
				defaultLocale: resolveConfigOption((config) => config.defaultLocale)
			};
		}
	};
	/**
	* Returns a config resolver that resolves a given config option's value.
	*
	* The resolver creates reactive boxes that resolve config option values using this priority:
	* 1. Current level's value (if defined)
	* 2. Parent level's value (if defined and current is undefined)
	* 3. `undefined` (if no value is found in either parent or child)
	*
	* @param parent - Parent configuration state (null if this is root level)
	* @param currentOpts - Current level's configuration options
	*
	* @example
	* ```typescript
	* // Given this hierarchy:
	* // Root: { defaultPortalTo: "#some-element" }
	* // Child: { someOtherProp: "value" } // no defaultPortalTo specified
	*
	* const resolveConfigOption = createConfigResolver(parent, opts);
	* const portalTo = resolveConfigOption(config => config.defaultPortalTo);
	*
	* // portalTo.current === "#some-element" (inherited from parent)
	* // even when child didn't specify `defaultPortalTo`
	* ```
	*/
	function createConfigResolver(parent, currentOpts) {
		return (getter) => {
			return boxWith(() => {
				const value = getter(currentOpts)?.current;
				if (value !== void 0) return value;
				if (parent === null) return void 0;
				return getter(parent.opts)?.current;
			});
		};
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/config/prop-resolvers.js
	/**
	* Creates a generic prop resolver that follows a standard priority chain:
	* 1. The getter's prop value (if defined)
	* 2. The config default value (if no getter prop value is defined)
	* 3. The fallback value (if no config value found)
	*/
	function createPropResolver(configOption, fallback) {
		return (getProp) => {
			const config = getBitsConfig();
			return boxWith(() => {
				const propValue = getProp();
				if (propValue !== void 0) return propValue;
				const option = configOption(config).current;
				if (option !== void 0) return option;
				return fallback;
			});
		};
	}
	/**
	* Resolves a portal's `to` value using the prop, the config default, or a fallback.
	*
	* Default value: `"body"`
	*/
	var resolvePortalToProp = createPropResolver((config) => config.defaultPortalTo, "body");
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/portal/portal.svelte
	function Portal($$anchor, $$props) {
		push($$props, true);
		const to = resolvePortalToProp(() => $$props.to);
		const context = getAllContexts();
		let target = /* @__PURE__ */ user_derived(getTarget);
		function getTarget() {
			if (!isBrowser || $$props.disabled) return null;
			let localTarget = null;
			if (typeof to.current === "string") localTarget = document.querySelector(to.current);
			else localTarget = to.current;
			return localTarget;
		}
		let instance;
		function unmountInstance() {
			if (instance) {
				unmount(instance);
				instance = null;
			}
		}
		watch([() => get$2(target), () => $$props.disabled], ([target, disabled]) => {
			if (!target || disabled) {
				unmountInstance();
				return;
			}
			instance = mount(Portal_consumer, {
				target,
				props: { children: $$props.children },
				context
			});
			return () => {
				unmountInstance();
			};
		});
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.children ?? noop$1);
			append($$anchor, fragment_1);
		};
		if_block(node, ($$render) => {
			if ($$props.disabled) $$render(consequent);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/events.js
	/**
	* Creates a typed event dispatcher and listener pair for custom events
	* @template T - The type of data that will be passed in the event detail
	* @param eventName - The name of the custom event
	* @param options - CustomEvent options (bubbles, cancelable, etc.)
	*/
	var CustomEventDispatcher = class {
		eventName;
		options;
		constructor(eventName, options = {
			bubbles: true,
			cancelable: true
		}) {
			this.eventName = eventName;
			this.options = options;
		}
		createEvent(detail) {
			return new CustomEvent(this.eventName, {
				...this.options,
				detail
			});
		}
		dispatch(element, detail) {
			const event = this.createEvent(detail);
			element.dispatchEvent(event);
			return event;
		}
		listen(element, callback, options) {
			const handler = (event) => {
				callback(event);
			};
			return on(element, this.eventName, handler, options);
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/debounce.js
	function debounce(fn, wait = 500) {
		let timeout = null;
		const debounced = (...args) => {
			if (timeout !== null) clearTimeout(timeout);
			timeout = setTimeout(() => {
				fn(...args);
			}, wait);
		};
		debounced.destroy = () => {
			if (timeout !== null) {
				clearTimeout(timeout);
				timeout = null;
			}
		};
		return debounced;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/elements.js
	function isOrContainsTarget(node, target) {
		return node === target || node.contains(target);
	}
	function getOwnerDocument(el) {
		return el?.ownerDocument ?? document;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/dom.js
	/**
	* Determines if the click event truly occurred outside the content node.
	* This was added to handle password managers and other elements that may be injected
	* into the DOM but visually appear inside the content.
	*/
	function isClickTrulyOutside(event, contentNode) {
		const { clientX, clientY } = event;
		const rect = contentNode.getBoundingClientRect();
		return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
	}
	//#endregion
	//#region node_modules/tabbable/dist/index.esm.js
	/*!
	* tabbable 6.5.0
	* @license MIT, https://github.com/focus-trap/tabbable/blob/master/LICENSE
	*/
	var candidateSelectors = [
		"input:not([inert]):not([inert] *)",
		"select:not([inert]):not([inert] *)",
		"textarea:not([inert]):not([inert] *)",
		"a[href]:not([inert]):not([inert] *)",
		"area[href]:not([inert]):not([inert] *)",
		"button:not([inert]):not([inert] *)",
		"[tabindex]:not(slot):not([inert]):not([inert] *)",
		"audio[controls]:not([inert]):not([inert] *)",
		"video[controls]:not([inert]):not([inert] *)",
		"[contenteditable]:not([contenteditable=\"false\"]):not([inert]):not([inert] *)",
		"details>summary:first-of-type:not([inert]):not([inert] *)",
		"details:not([inert]):not([inert] *)"
	];
	var candidateSelector = /* #__PURE__ */ candidateSelectors.join(",");
	var NoElement = typeof Element === "undefined";
	var matches = NoElement ? function() {} : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
	var getRootNode = !NoElement && Element.prototype.getRootNode ? function(element) {
		var _element$getRootNode;
		return element === null || element === void 0 ? void 0 : (_element$getRootNode = element.getRootNode) === null || _element$getRootNode === void 0 ? void 0 : _element$getRootNode.call(element);
	} : function(element) {
		return element === null || element === void 0 ? void 0 : element.ownerDocument;
	};
	/**
	* Determines if a node is inert or in an inert ancestor.
	* @param {Node} [node]
	* @param {boolean} [lookUp] If true and `node` is not inert, looks up at ancestors to
	*  see if any of them are inert. If false, only `node` itself is considered.
	* @returns {boolean} True if inert itself or by way of being in an inert ancestor.
	*  False if `node` is falsy.
	*/
	var _isInert = function isInert(node, lookUp) {
		var _node$getAttribute;
		if (lookUp === void 0) lookUp = true;
		var inertAtt = node === null || node === void 0 ? void 0 : (_node$getAttribute = node.getAttribute) === null || _node$getAttribute === void 0 ? void 0 : _node$getAttribute.call(node, "inert");
		return inertAtt === "" || inertAtt === "true" || lookUp && node && (typeof node.closest === "function" ? node.closest("[inert]") : _isInert(node.parentNode));
	};
	/**
	* Determines if a node's content is editable.
	* @param {Element} [node]
	* @returns True if it's content-editable; false if it's not or `node` is falsy.
	*/
	var isContentEditable = function isContentEditable(node) {
		var _node$getAttribute2;
		var attValue = node === null || node === void 0 ? void 0 : (_node$getAttribute2 = node.getAttribute) === null || _node$getAttribute2 === void 0 ? void 0 : _node$getAttribute2.call(node, "contenteditable");
		return attValue === "" || attValue === "true";
	};
	/**
	* @param {Element} el container to check in
	* @param {boolean} includeContainer add container to check
	* @param {(node: Element) => boolean} filter filter candidates
	* @returns {Element[]}
	*/
	var getCandidates = function getCandidates(el, includeContainer, filter) {
		if (_isInert(el)) return [];
		var candidates = Array.prototype.slice.apply(el.querySelectorAll(candidateSelector));
		if (includeContainer && matches.call(el, candidateSelector)) candidates.unshift(el);
		candidates = candidates.filter(filter);
		return candidates;
	};
	/**
	* @callback GetShadowRoot
	* @param {Element} element to check for shadow root
	* @returns {ShadowRoot|boolean} ShadowRoot if available or boolean indicating if a shadowRoot is attached but not available.
	*/
	/**
	* @callback ShadowRootFilter
	* @param {Element} shadowHostNode the element which contains shadow content
	* @returns {boolean} true if a shadow root could potentially contain valid candidates.
	*/
	/**
	* @typedef {Object} CandidateScope
	* @property {Element} scopeParent contains inner candidates
	* @property {Element[]} candidates list of candidates found in the scope parent
	*/
	/**
	* @typedef {Object} IterativeOptions
	* @property {GetShadowRoot|boolean} getShadowRoot true if shadow support is enabled; falsy if not;
	*  if a function, implies shadow support is enabled and either returns the shadow root of an element
	*  or a boolean stating if it has an undisclosed shadow root
	* @property {(node: Element) => boolean} filter filter candidates
	* @property {boolean} flatten if true then result will flatten any CandidateScope into the returned list
	* @property {ShadowRootFilter} shadowRootFilter filter shadow roots;
	*/
	/**
	* @param {Element[]} elements list of element containers to match candidates from
	* @param {boolean} includeContainer add container list to check
	* @param {IterativeOptions} options
	* @returns {Array.<Element|CandidateScope>}
	*/
	var _getCandidatesIteratively = function getCandidatesIteratively(elements, includeContainer, options) {
		var candidates = [];
		var elementsToCheck = Array.from(elements);
		while (elementsToCheck.length) {
			var element = elementsToCheck.shift();
			if (_isInert(element, false)) continue;
			if (element.tagName === "SLOT") {
				var assigned = element.assignedElements();
				var nestedCandidates = _getCandidatesIteratively(assigned.length ? assigned : element.children, true, options);
				if (options.flatten) candidates.push.apply(candidates, nestedCandidates);
				else candidates.push({
					scopeParent: element,
					candidates: nestedCandidates
				});
			} else {
				if (matches.call(element, candidateSelector) && options.filter(element) && (includeContainer || !elements.includes(element))) candidates.push(element);
				var shadowRoot = element.shadowRoot || typeof options.getShadowRoot === "function" && options.getShadowRoot(element);
				var validShadowRoot = !_isInert(shadowRoot, false) && (!options.shadowRootFilter || options.shadowRootFilter(element));
				if (shadowRoot && validShadowRoot) {
					var _nestedCandidates = _getCandidatesIteratively(shadowRoot === true ? element.children : shadowRoot.children, true, options);
					if (options.flatten) candidates.push.apply(candidates, _nestedCandidates);
					else candidates.push({
						scopeParent: element,
						candidates: _nestedCandidates
					});
				} else elementsToCheck.unshift.apply(elementsToCheck, element.children);
			}
		}
		return candidates;
	};
	/**
	* @private
	* Determines if the node has an explicitly specified `tabindex` attribute.
	* @param {HTMLElement} node
	* @returns {boolean} True if so; false if not.
	*/
	var hasTabIndex = function hasTabIndex(node) {
		return !isNaN(parseInt(node.getAttribute("tabindex"), 10));
	};
	/**
	* Determine the tab index of a given node.
	* @param {HTMLElement} node
	* @returns {number} Tab order (negative, 0, or positive number).
	* @throws {Error} If `node` is falsy.
	*/
	var getTabIndex = function getTabIndex(node) {
		if (!node) throw new Error("No node provided");
		if (node.tabIndex < 0) {
			if ((/^(AUDIO|VIDEO|DETAILS)$/.test(node.tagName) || isContentEditable(node)) && !hasTabIndex(node)) return 0;
		}
		return node.tabIndex;
	};
	/**
	* Determine the tab index of a given node __for sort order purposes__.
	* @param {HTMLElement} node
	* @param {boolean} [isScope] True for a custom element with shadow root or slot that, by default,
	*  has tabIndex -1, but needs to be sorted by document order in order for its content to be
	*  inserted into the correct sort position.
	* @returns {number} Tab order (negative, 0, or positive number).
	*/
	var getSortOrderTabIndex = function getSortOrderTabIndex(node, isScope) {
		var tabIndex = getTabIndex(node);
		if (tabIndex < 0 && isScope && !hasTabIndex(node)) return 0;
		return tabIndex;
	};
	var sortOrderedTabbables = function sortOrderedTabbables(a, b) {
		return a.tabIndex === b.tabIndex ? a.documentOrder - b.documentOrder : a.tabIndex - b.tabIndex;
	};
	var isInput = function isInput(node) {
		return node.tagName === "INPUT";
	};
	var isHiddenInput = function isHiddenInput(node) {
		return isInput(node) && node.type === "hidden";
	};
	var isDetailsWithSummary = function isDetailsWithSummary(node) {
		return node.tagName === "DETAILS" && Array.prototype.slice.apply(node.children).some(function(child) {
			return child.tagName === "SUMMARY";
		});
	};
	var getCheckedRadio = function getCheckedRadio(nodes, form) {
		for (var i = 0; i < nodes.length; i++) if (nodes[i].checked && nodes[i].form === form) return nodes[i];
	};
	var isTabbableRadio = function isTabbableRadio(node) {
		if (!node.name) return true;
		var radioScope = node.form || getRootNode(node);
		var queryRadios = function queryRadios(name) {
			return radioScope.querySelectorAll("input[type=\"radio\"][name=\"" + name + "\"]");
		};
		var radioSet;
		if (typeof window !== "undefined" && typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function") radioSet = queryRadios(window.CSS.escape(node.name));
		else try {
			radioSet = queryRadios(node.name);
		} catch (err) {
			console.error("Looks like you have a radio button with a name attribute containing invalid CSS selector characters and need the CSS.escape polyfill: %s", err.message);
			return false;
		}
		var checked = getCheckedRadio(radioSet, node.form);
		return !checked || checked === node;
	};
	var isRadio = function isRadio(node) {
		return isInput(node) && node.type === "radio";
	};
	var isNonTabbableRadio = function isNonTabbableRadio(node) {
		return isRadio(node) && !isTabbableRadio(node);
	};
	var isNodeAttached = function isNodeAttached(node) {
		var _nodeRoot;
		var nodeRoot = node && getRootNode(node);
		var nodeRootHost = (_nodeRoot = nodeRoot) === null || _nodeRoot === void 0 ? void 0 : _nodeRoot.host;
		var attached = false;
		if (nodeRoot && nodeRoot !== node) {
			var _nodeRootHost, _nodeRootHost$ownerDo, _node$ownerDocument;
			attached = !!((_nodeRootHost = nodeRootHost) !== null && _nodeRootHost !== void 0 && (_nodeRootHost$ownerDo = _nodeRootHost.ownerDocument) !== null && _nodeRootHost$ownerDo !== void 0 && _nodeRootHost$ownerDo.contains(nodeRootHost) || node !== null && node !== void 0 && (_node$ownerDocument = node.ownerDocument) !== null && _node$ownerDocument !== void 0 && _node$ownerDocument.contains(node));
			while (!attached && nodeRootHost) {
				var _nodeRoot2, _nodeRootHost2, _nodeRootHost2$ownerD;
				nodeRoot = getRootNode(nodeRootHost);
				nodeRootHost = (_nodeRoot2 = nodeRoot) === null || _nodeRoot2 === void 0 ? void 0 : _nodeRoot2.host;
				attached = !!((_nodeRootHost2 = nodeRootHost) !== null && _nodeRootHost2 !== void 0 && (_nodeRootHost2$ownerD = _nodeRootHost2.ownerDocument) !== null && _nodeRootHost2$ownerD !== void 0 && _nodeRootHost2$ownerD.contains(nodeRootHost));
			}
		}
		return attached;
	};
	var isZeroArea = function isZeroArea(node) {
		var _node$getBoundingClie = node.getBoundingClientRect(), width = _node$getBoundingClie.width, height = _node$getBoundingClie.height;
		return width === 0 && height === 0;
	};
	var isHidden = function isHidden(node, _ref) {
		var displayCheck = _ref.displayCheck, getShadowRoot = _ref.getShadowRoot;
		if (displayCheck === "full-native") {
			if ("checkVisibility" in node) return !node.checkVisibility({
				checkOpacity: false,
				opacityProperty: false,
				contentVisibilityAuto: true,
				visibilityProperty: true,
				checkVisibilityCSS: true
			});
		}
		var visibility = getComputedStyle(node).visibility;
		if (visibility === "hidden" || visibility === "collapse") return true;
		var nodeUnderDetails = matches.call(node, "details>summary:first-of-type") ? node.parentElement : node;
		if (matches.call(nodeUnderDetails, "details:not([open]) *")) return true;
		if (!displayCheck || displayCheck === "full" || displayCheck === "full-native" || displayCheck === "legacy-full") {
			if (typeof getShadowRoot === "function") {
				var originalNode = node;
				while (node) {
					var parentElement = node.parentElement;
					var rootNode = getRootNode(node);
					if (parentElement && !parentElement.shadowRoot && getShadowRoot(parentElement) === true) return isZeroArea(node);
					else if (node.assignedSlot) node = node.assignedSlot;
					else if (!parentElement && rootNode !== node.ownerDocument) node = rootNode.host;
					else node = parentElement;
				}
				node = originalNode;
			}
			if (isNodeAttached(node)) return !node.getClientRects().length;
			if (displayCheck !== "legacy-full") return true;
		} else if (displayCheck === "non-zero-area") return isZeroArea(node);
		return false;
	};
	var isDisabledFromFieldset = function isDisabledFromFieldset(node) {
		if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(node.tagName)) {
			var parentNode = node.parentElement;
			while (parentNode) {
				if (parentNode.tagName === "FIELDSET" && parentNode.disabled) {
					for (var i = 0; i < parentNode.children.length; i++) {
						var child = parentNode.children.item(i);
						if (child.tagName === "LEGEND") return matches.call(parentNode, "fieldset[disabled] *") ? true : !child.contains(node);
					}
					return true;
				}
				parentNode = parentNode.parentElement;
			}
		}
		return false;
	};
	var isNodeMatchingSelectorFocusable = function isNodeMatchingSelectorFocusable(options, node) {
		if (node.disabled || isHiddenInput(node) || isHidden(node, options) || isDetailsWithSummary(node) || isDisabledFromFieldset(node)) return false;
		return true;
	};
	var isNodeMatchingSelectorTabbable = function isNodeMatchingSelectorTabbable(options, node) {
		if (isNonTabbableRadio(node) || getTabIndex(node) < 0 || !isNodeMatchingSelectorFocusable(options, node)) return false;
		return true;
	};
	var isShadowRootTabbable = function isShadowRootTabbable(shadowHostNode) {
		var tabIndex = parseInt(shadowHostNode.getAttribute("tabindex"), 10);
		if (isNaN(tabIndex) || tabIndex >= 0) return true;
		return false;
	};
	/**
	* @param {Array.<Element|CandidateScope>} candidates
	* @returns Element[]
	*/
	var _sortByOrder = function sortByOrder(candidates) {
		var regularTabbables = [];
		var orderedTabbables = [];
		candidates.forEach(function(item, i) {
			var isScope = !!item.scopeParent;
			var element = isScope ? item.scopeParent : item;
			var candidateTabindex = getSortOrderTabIndex(element, isScope);
			var elements = isScope ? _sortByOrder(item.candidates) : element;
			if (candidateTabindex === 0) isScope ? regularTabbables.push.apply(regularTabbables, elements) : regularTabbables.push(element);
			else orderedTabbables.push({
				documentOrder: i,
				tabIndex: candidateTabindex,
				item,
				isScope,
				content: elements
			});
		});
		return orderedTabbables.sort(sortOrderedTabbables).reduce(function(acc, sortable) {
			sortable.isScope ? acc.push.apply(acc, sortable.content) : acc.push(sortable.content);
			return acc;
		}, []).concat(regularTabbables);
	};
	var tabbable = function tabbable(container, options) {
		options = options || {};
		var candidates;
		if (options.getShadowRoot) candidates = _getCandidatesIteratively([container], options.includeContainer, {
			filter: isNodeMatchingSelectorTabbable.bind(null, options),
			flatten: false,
			getShadowRoot: options.getShadowRoot,
			shadowRootFilter: isShadowRootTabbable
		});
		else candidates = getCandidates(container, options.includeContainer, isNodeMatchingSelectorTabbable.bind(null, options));
		return _sortByOrder(candidates);
	};
	var focusable = function focusable(container, options) {
		options = options || {};
		var candidates;
		if (options.getShadowRoot) candidates = _getCandidatesIteratively([container], options.includeContainer, {
			filter: isNodeMatchingSelectorFocusable.bind(null, options),
			flatten: true,
			getShadowRoot: options.getShadowRoot
		});
		else candidates = getCandidates(container, options.includeContainer, isNodeMatchingSelectorFocusable.bind(null, options));
		return candidates;
	};
	var isTabbable = function isTabbable(node, options) {
		options = options || {};
		if (!node) throw new Error("No node provided");
		if (matches.call(node, candidateSelector) === false) return false;
		return isNodeMatchingSelectorTabbable(options, node);
	};
	var focusableCandidateSelector = /* #__PURE__ */ candidateSelectors.concat("iframe:not([inert]):not([inert] *)").join(",");
	var isFocusable = function isFocusable(node, options) {
		options = options || {};
		if (!node) throw new Error("No node provided");
		if (matches.call(node, focusableCandidateSelector) === false) return false;
		return isNodeMatchingSelectorFocusable(options, node);
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/arrays.js
	/**
	* Returns the array element after the given index, or undefined for out-of-bounds or empty arrays.
	* @param array the array.
	* @param index the index of the current element.
	* @param loop loop to the beginning of the array if the next index is out of bounds?
	*/
	/**
	* Returns the array element after the given index, or undefined for out-of-bounds or empty arrays.
	* For single-element arrays, returns the element if the index is 0.
	* @param array the array.
	* @param index the index of the current element.
	* @param loop loop to the beginning of the array if the next index is out of bounds?
	*/
	function next(array, index, loop = true) {
		if (array.length === 0 || index < 0 || index >= array.length) return;
		if (array.length === 1 && index === 0) return array[0];
		if (index === array.length - 1) return loop ? array[0] : void 0;
		return array[index + 1];
	}
	/**
	* Returns the array element prior to the given index, or undefined for out-of-bounds or empty arrays.
	* For single-element arrays, returns the element if the index is 0.
	* @param array the array.
	* @param index the index of the current element.
	* @param loop loop to the end of the array if the previous index is out of bounds?
	*/
	function prev(array, index, loop = true) {
		if (array.length === 0 || index < 0 || index >= array.length) return;
		if (array.length === 1 && index === 0) return array[0];
		if (index === 0) return loop ? array[array.length - 1] : void 0;
		return array[index - 1];
	}
	/**
	* Returns the element some number after the given index. If the target index is out of bounds:
	*   - If looping is disabled, the first or last element will be returned.
	*   - If looping is enabled, it will wrap around the array.
	* Returns undefined for empty arrays or out-of-bounds initial indices.
	* @param array the array.
	* @param index the index of the current element.
	* @param increment the number of elements to move forward (can be negative).
	* @param loop loop around the array if the target index is out of bounds?
	*/
	function forward(array, index, increment, loop = true) {
		if (array.length === 0 || index < 0 || index >= array.length) return;
		let targetIndex = index + increment;
		if (loop) targetIndex = (targetIndex % array.length + array.length) % array.length;
		else targetIndex = Math.max(0, Math.min(targetIndex, array.length - 1));
		return array[targetIndex];
	}
	/**
	* Returns the element some number before the given index. If the target index is out of bounds:
	*   - If looping is disabled, the first or last element will be returned.
	*   - If looping is enabled, it will wrap around the array.
	* Returns undefined for empty arrays or out-of-bounds initial indices.
	* @param array the array.
	* @param index the index of the current element.
	* @param decrement the number of elements to move backward (can be negative).
	* @param loop loop around the array if the target index is out of bounds?
	*/
	function backward(array, index, decrement, loop = true) {
		if (array.length === 0 || index < 0 || index >= array.length) return;
		let targetIndex = index - decrement;
		if (loop) targetIndex = (targetIndex % array.length + array.length) % array.length;
		else targetIndex = Math.max(0, Math.min(targetIndex, array.length - 1));
		return array[targetIndex];
	}
	/**
	* Finds the next matching item from a list of values based on a search string.
	*
	* This function handles several special cases in typeahead behavior:
	*
	* 1. Space handling: When a search string ends with a space, it handles it specially:
	*    - If there's only one match for the text before the space, it ignores the space
	*    - If there are multiple matches and the current match already starts with the search prefix
	*      followed by a space, it keeps the current match (doesn't change selection on space)
	*    - Only after typing characters beyond the space will it move to a more specific match
	*
	* 2. Repeated character handling: If a search consists of repeated characters (e.g., "aaa"),
	*    it treats it as a single character for matching purposes
	*
	* 3. Cycling behavior: The function wraps around the values array starting from the current match
	*    to find the next appropriate match, creating a cycling selection behavior
	*
	* @param values - Array of string values to search through (e.g., the text content of menu items)
	* @param search - The current search string typed by the user
	* @param currentMatch - The currently selected/matched item, if any
	* @returns The next matching value that should be selected, or undefined if no match is found
	*/
	function getNextMatch(values, search, currentMatch) {
		const lowerSearch = search.toLowerCase();
		if (lowerSearch.endsWith(" ")) {
			const searchWithoutSpace = lowerSearch.slice(0, -1);
			/**
			* If there's only one match for the prefix without space, we don't
			* watch to match with space.
			*/
			if (values.filter((value) => value.toLowerCase().startsWith(searchWithoutSpace)).length <= 1) return getNextMatch(values, searchWithoutSpace, currentMatch);
			const currentMatchLowercase = currentMatch?.toLowerCase();
			/**
			* If the current match already starts with the search prefix and has a space afterward,
			* and the user has only typed up to that space, keep the current match until they
			* disambiguate.
			*/
			if (currentMatchLowercase && currentMatchLowercase.startsWith(searchWithoutSpace) && currentMatchLowercase.charAt(searchWithoutSpace.length) === " " && search.trim() === searchWithoutSpace) return currentMatch;
			/**
			* With multiple matches, find items that match the full search string with space
			*/
			const spacedMatches = values.filter((value) => value.toLowerCase().startsWith(lowerSearch));
			/**
			* If we found matches with the space, use the first one that's not the current match
			*/
			if (spacedMatches.length > 0) {
				const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
				return wrapArray(spacedMatches, Math.max(currentMatchIndex, 0)).find((match) => match !== currentMatch) || currentMatch;
			}
		}
		const normalizedSearch = search.length > 1 && Array.from(search).every((char) => char === search[0]) ? search[0] : search;
		const normalizedLowerSearch = normalizedSearch.toLowerCase();
		const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
		let wrappedValues = wrapArray(values, Math.max(currentMatchIndex, 0));
		if (normalizedSearch.length === 1) wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
		const nextMatch = wrappedValues.find((value) => value?.toLowerCase().startsWith(normalizedLowerSearch));
		return nextMatch !== currentMatch ? nextMatch : void 0;
	}
	/**
	* Wraps an array around itself at a given start index
	* Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
	*/
	function wrapArray(array, startIndex) {
		return array.map((_, index) => array[(startIndex + index) % array.length]);
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/box-auto-reset.svelte.js
	var defaultOptions = {
		afterMs: 1e4,
		onChange: noop
	};
	function boxAutoReset(defaultValue, options) {
		const { afterMs, onChange, getWindow } = {
			...defaultOptions,
			...options
		};
		let timeout = null;
		let value = /* @__PURE__ */ state(proxy(defaultValue));
		function resetAfter() {
			return getWindow().setTimeout(() => {
				set(value, defaultValue, true);
				onChange?.(defaultValue);
			}, afterMs);
		}
		user_effect(() => {
			return () => {
				if (timeout) getWindow().clearTimeout(timeout);
			};
		});
		return boxWith(() => get$2(value), (v) => {
			set(value, v, true);
			onChange?.(v);
			if (timeout) getWindow().clearTimeout(timeout);
			timeout = resetAfter();
		});
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/dom-typeahead.svelte.js
	var DOMTypeahead = class {
		#opts;
		#search;
		#onMatch = /* @__PURE__ */ user_derived(() => {
			if (this.#opts.onMatch) return this.#opts.onMatch;
			return (node) => node.focus();
		});
		#getCurrentItem = /* @__PURE__ */ user_derived(() => {
			if (this.#opts.getCurrentItem) return this.#opts.getCurrentItem;
			return this.#opts.getActiveElement;
		});
		constructor(opts) {
			this.#opts = opts;
			this.#search = boxAutoReset("", {
				afterMs: 1e3,
				getWindow: opts.getWindow
			});
			this.handleTypeaheadSearch = this.handleTypeaheadSearch.bind(this);
			this.resetTypeahead = this.resetTypeahead.bind(this);
		}
		handleTypeaheadSearch(key, candidates) {
			if (!candidates.length) return;
			this.#search.current = this.#search.current + key;
			const currentItem = get$2(this.#getCurrentItem)();
			const currentMatch = candidates.find((item) => item === currentItem)?.textContent?.trim() ?? "";
			const nextMatch = getNextMatch(candidates.map((item) => item.textContent?.trim() ?? ""), this.#search.current, currentMatch);
			const newItem = candidates.find((item) => item.textContent?.trim() === nextMatch);
			if (newItem) get$2(this.#onMatch)(newItem);
			return newItem;
		}
		resetTypeahead() {
			this.#search.current = "";
		}
		get search() {
			return this.#search.current;
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/menu/menu.svelte.js
	var CONTEXT_MENU_TRIGGER_ATTR = "data-context-menu-trigger";
	var CONTEXT_MENU_CONTENT_ATTR = "data-context-menu-content";
	new Context("Menu.Root");
	new Context("Menu.Root | Menu.Sub");
	new Context("Menu.Content");
	new Context("Menu.Group | Menu.RadioGroup");
	new Context("Menu.RadioGroup");
	new Context("Menu.CheckboxGroup");
	new CustomEventDispatcher("bitsmenuopen", {
		bubbles: false,
		cancelable: true
	});
	createBitsAttrs({
		component: "menu",
		parts: [
			"trigger",
			"content",
			"sub-trigger",
			"item",
			"group",
			"group-heading",
			"checkbox-group",
			"checkbox-item",
			"radio-group",
			"radio-item",
			"separator",
			"sub-content",
			"arrow"
		]
	});
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/dismissible-layer/use-dismissable-layer.svelte.js
	globalThis.bitsDismissableLayers ??= /* @__PURE__ */ new Map();
	var DismissibleLayerState = class DismissibleLayerState {
		static create(opts) {
			return new DismissibleLayerState(opts);
		}
		opts;
		#interactOutsideProp;
		#behaviorType;
		#interceptedEvents = { pointerdown: false };
		#isResponsibleLayer = false;
		#isFocusInsideDOMTree = false;
		#documentObj = void 0;
		#onFocusOutside;
		#unsubClickListener = noop;
		/**
		* Set once the layer is torn down. Deferred work scheduled before teardown can
		* still run afterwards, so every such callback must short-circuit on this
		* before reading `this.opts.ref.current` — reading a destroyed `$derived`
		* triggers Svelte's `derived_inert` warning. A class field rather than a
		* constructor local so the class-field handlers below can see it too.
		*/
		#destroyed = false;
		constructor(opts) {
			this.opts = opts;
			this.#behaviorType = opts.interactOutsideBehavior;
			this.#interactOutsideProp = opts.onInteractOutside;
			this.#onFocusOutside = opts.onFocusOutside;
			user_effect(() => {
				this.#documentObj = getOwnerDocument(this.opts.ref.current);
			});
			let unsubEvents = noop;
			let pendingTimer = null;
			const clearPendingTimer = () => {
				if (pendingTimer != null) {
					clearTimeout(pendingTimer);
					pendingTimer = null;
				}
			};
			const cleanup = () => {
				clearPendingTimer();
				this.#resetState();
				globalThis.bitsDismissableLayers.delete(this);
				this.#handleInteractOutside.destroy();
				unsubEvents();
			};
			watch([() => this.opts.enabled.current, () => this.opts.ref.current], () => {
				if (!this.opts.enabled.current || !this.opts.ref.current) return;
				clearPendingTimer();
				pendingTimer = afterSleep(1, () => {
					pendingTimer = null;
					if (this.#destroyed || !this.opts.ref.current) return;
					globalThis.bitsDismissableLayers.set(this, this.#behaviorType);
					unsubEvents();
					unsubEvents = this.#addEventListeners();
				});
				return cleanup;
			});
			onDestroyEffect(() => {
				this.#destroyed = true;
				clearPendingTimer();
				this.#resetState();
				globalThis.bitsDismissableLayers.delete(this);
				this.#handleInteractOutside.destroy();
				this.#unsubClickListener();
				unsubEvents();
			});
		}
		#handleFocus = (event) => {
			if (event.defaultPrevented) return;
			if (this.#destroyed || !this.opts.ref.current) return;
			afterTick(() => {
				if (this.#destroyed) return;
				if (!this.opts.ref.current || this.#isTargetWithinLayer(event.target)) return;
				if (event.target && !this.#isFocusInsideDOMTree) this.#onFocusOutside.current?.(event);
			});
		};
		#addEventListeners() {
			return executeCallbacks(
				/**
				* CAPTURE INTERACTION START
				* mark interaction-start event as intercepted.
				* mark responsible layer during interaction start
				* to avoid checking if is responsible layer during interaction end
				* when a new floating element may have been opened.
				*/
				on(this.#documentObj, "pointerdown", executeCallbacks(this.#markInterceptedEvent, this.#markResponsibleLayer), { capture: true }),
				/**
				* BUBBLE INTERACTION START
				* Mark interaction-start event as non-intercepted. Debounce `onInteractOutsideStart`
				* to avoid prematurely checking if other events were intercepted.
				*/
				on(this.#documentObj, "pointerdown", executeCallbacks(this.#markNonInterceptedEvent, this.#handleInteractOutside)),
				/**
				* HANDLE FOCUS OUTSIDE
				*/
				on(this.#documentObj, "focusin", this.#handleFocus)
			);
		}
		#handleDismiss = (e) => {
			let event = e;
			if (event.defaultPrevented) event = createWrappedEvent(e);
			this.#interactOutsideProp.current(e);
		};
		#handleInteractOutside = debounce((e) => {
			if (!this.opts.ref.current) {
				this.#unsubClickListener();
				return;
			}
			const isEventValid = this.opts.isValidEvent.current(e, this.opts.ref.current) || isValidEvent(e, this.opts.ref.current);
			if (!this.#isResponsibleLayer || this.#isAnyEventIntercepted() || !isEventValid) {
				this.#unsubClickListener();
				return;
			}
			let event = e;
			if (event.defaultPrevented) event = createWrappedEvent(event);
			if (this.#behaviorType.current !== "close" && this.#behaviorType.current !== "defer-otherwise-close") {
				this.#unsubClickListener();
				return;
			}
			if (e.pointerType === "touch") {
				this.#unsubClickListener();
				this.#unsubClickListener = on(this.#documentObj, "click", this.#handleDismiss, { once: true });
			} else this.#interactOutsideProp.current(event);
		}, 10);
		#markInterceptedEvent = (e) => {
			this.#interceptedEvents[e.type] = true;
		};
		#markNonInterceptedEvent = (e) => {
			this.#interceptedEvents[e.type] = false;
		};
		#markResponsibleLayer = () => {
			if (!this.opts.ref.current) return;
			this.#isResponsibleLayer = isResponsibleLayer(this.opts.ref.current);
		};
		#isTargetWithinLayer = (target) => {
			if (!this.opts.ref.current) return false;
			return isOrContainsTarget(this.opts.ref.current, target);
		};
		/**
		* Resets the per-interaction state. Must stay synchronous.
		*
		* This was a `debounce(..., 20)` from when it was also wired to a capture-phase
		* interaction-end listener and had to land after the 10ms `#handleInteractOutside`
		* debounce. That listener is gone, but the debounce stayed on the `cleanup()` path —
		* and because `watch` runs `cleanup()` once per open (`ref` goes null -> node), every
		* layer scheduled a reset 20ms into its own lifetime. An outside `pointerdown` landing
		* 10-20ms after that cleanup would have its `#isResponsibleLayer` flag cleared by the
		* stale reset in the gap before the debounced `#handleInteractOutside` ran, which then
		* bailed and left the layer open. `cleanup()` destroys `#handleInteractOutside` anyway,
		* so nothing is left in flight that needs to observe the pre-reset state.
		*/
		#resetState = () => {
			for (const eventType in this.#interceptedEvents) this.#interceptedEvents[eventType] = false;
			this.#isResponsibleLayer = false;
		};
		#isAnyEventIntercepted() {
			return Object.values(this.#interceptedEvents).some(Boolean);
		}
		#onfocuscapture = () => {
			this.#isFocusInsideDOMTree = true;
		};
		#onblurcapture = () => {
			this.#isFocusInsideDOMTree = false;
		};
		props = {
			onfocuscapture: this.#onfocuscapture,
			onblurcapture: this.#onblurcapture
		};
	};
	function getTopMostDismissableLayer(layersArr = [...globalThis.bitsDismissableLayers]) {
		return layersArr.findLast(([_, { current: behaviorType }]) => behaviorType === "close" || behaviorType === "ignore");
	}
	function isResponsibleLayer(node) {
		const layersArr = [...globalThis.bitsDismissableLayers];
		/**
		* We first check if we can find a top layer with `close` or `ignore`.
		* If that top layer was found and matches the provided node, then the node is
		* responsible for the outside interaction. Otherwise, we know that all layers defer so
		* the first layer is the responsible one.
		*/
		const topMostLayer = getTopMostDismissableLayer(layersArr);
		if (topMostLayer) return topMostLayer[0].opts.ref.current === node;
		const [firstLayerNode] = layersArr[0];
		return firstLayerNode.opts.ref.current === node;
	}
	function isValidEvent(e, node) {
		const target = e.target;
		if (!isElementOrSVGElement(target)) return false;
		const targetIsContextMenuTrigger = Boolean(target.closest(`[${CONTEXT_MENU_TRIGGER_ATTR}]`));
		const nodeIsContextMenu = Boolean(node.closest(`[${CONTEXT_MENU_CONTENT_ATTR}]`));
		if ("button" in e && e.button > 0 && !targetIsContextMenuTrigger) return false;
		if ("button" in e && e.button === 0 && targetIsContextMenuTrigger && nodeIsContextMenu) return true;
		if (targetIsContextMenuTrigger && nodeIsContextMenu) return false;
		return getOwnerDocument(target).documentElement.contains(target) && !isOrContainsTarget(node, target) && isClickTrulyOutside(e, node);
	}
	function createWrappedEvent(e) {
		const capturedCurrentTarget = e.currentTarget;
		const capturedTarget = e.target;
		let newEvent;
		if (e instanceof PointerEvent) newEvent = new PointerEvent(e.type, e);
		else newEvent = new PointerEvent("pointerdown", e);
		let isPrevented = false;
		return new Proxy(newEvent, { get: (target, prop) => {
			if (prop === "currentTarget") return capturedCurrentTarget;
			if (prop === "target") return capturedTarget;
			if (prop === "preventDefault") return () => {
				isPrevented = true;
				if (typeof target.preventDefault === "function") target.preventDefault();
			};
			if (prop === "defaultPrevented") return isPrevented;
			if (prop in target) return target[prop];
			return e[prop];
		} });
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/dismissible-layer/dismissible-layer.svelte
	function Dismissible_layer($$anchor, $$props) {
		push($$props, true);
		let interactOutsideBehavior = prop($$props, "interactOutsideBehavior", 3, "close"), onInteractOutside = prop($$props, "onInteractOutside", 3, noop), onFocusOutside = prop($$props, "onFocusOutside", 3, noop), isValidEvent = prop($$props, "isValidEvent", 3, () => false);
		const dismissibleLayerState = DismissibleLayerState.create({
			id: boxWith(() => $$props.id),
			interactOutsideBehavior: boxWith(() => interactOutsideBehavior()),
			onInteractOutside: boxWith(() => onInteractOutside()),
			enabled: boxWith(() => $$props.enabled),
			onFocusOutside: boxWith(() => onFocusOutside()),
			isValidEvent: boxWith(() => isValidEvent()),
			ref: $$props.ref
		});
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.children ?? noop$1, () => ({ props: dismissibleLayerState.props }));
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/escape-layer/use-escape-layer.svelte.js
	globalThis.bitsEscapeLayers ??= /* @__PURE__ */ new Map();
	var EscapeLayerState = class EscapeLayerState {
		static create(opts) {
			return new EscapeLayerState(opts);
		}
		opts;
		domContext;
		constructor(opts) {
			this.opts = opts;
			this.domContext = new DOMContext(this.opts.ref);
			let unsubEvents = noop;
			watch(() => opts.enabled.current, (enabled) => {
				if (enabled) {
					globalThis.bitsEscapeLayers.set(this, opts.escapeKeydownBehavior);
					unsubEvents = this.#addEventListener();
				}
				return () => {
					unsubEvents();
					globalThis.bitsEscapeLayers.delete(this);
				};
			});
		}
		#addEventListener = () => {
			return on(this.domContext.getDocument(), "keydown", this.#onkeydown, { passive: false });
		};
		#onkeydown = (e) => {
			if (e.key !== "Escape" || !isResponsibleEscapeLayer(this)) return;
			const clonedEvent = new KeyboardEvent(e.type, e);
			e.preventDefault();
			const behaviorType = this.opts.escapeKeydownBehavior.current;
			if (behaviorType !== "close" && behaviorType !== "defer-otherwise-close") return;
			this.opts.onEscapeKeydown.current(clonedEvent);
		};
	};
	function isResponsibleEscapeLayer(instance) {
		const layersArr = [...globalThis.bitsEscapeLayers];
		/**
		* We first check if we can find a top layer with `close` or `ignore`.
		* If that top layer was found and matches the provided node, then the node is
		* responsible for the escape. Otherwise, we know that all layers defer so
		* the first layer is the responsible one.
		*/
		const topMostLayer = layersArr.findLast(([_, { current: behaviorType }]) => behaviorType === "close" || behaviorType === "ignore");
		if (topMostLayer) return topMostLayer[0] === instance;
		const [firstLayerNode] = layersArr[0];
		return firstLayerNode === instance;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/escape-layer/escape-layer.svelte
	function Escape_layer($$anchor, $$props) {
		push($$props, true);
		let escapeKeydownBehavior = prop($$props, "escapeKeydownBehavior", 3, "close"), onEscapeKeydown = prop($$props, "onEscapeKeydown", 3, noop);
		EscapeLayerState.create({
			escapeKeydownBehavior: boxWith(() => escapeKeydownBehavior()),
			onEscapeKeydown: boxWith(() => onEscapeKeydown()),
			enabled: boxWith(() => $$props.enabled),
			ref: $$props.ref
		});
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.children ?? noop$1);
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/focus-scope/focus-scope-manager.js
	var FocusScopeManager = class FocusScopeManager {
		static instance;
		#scopeStack = simpleBox([]);
		#focusHistory = /* @__PURE__ */ new WeakMap();
		#preFocusHistory = /* @__PURE__ */ new WeakMap();
		static getInstance() {
			if (!this.instance) this.instance = new FocusScopeManager();
			return this.instance;
		}
		register(scope) {
			const current = this.getActive();
			if (current && current !== scope) current.pause();
			const activeElement = document.activeElement;
			if (activeElement && activeElement !== document.body) this.#preFocusHistory.set(scope, activeElement);
			this.#scopeStack.current = this.#scopeStack.current.filter((s) => s !== scope);
			this.#scopeStack.current.unshift(scope);
		}
		unregister(scope) {
			this.#scopeStack.current = this.#scopeStack.current.filter((s) => s !== scope);
			const next = this.getActive();
			if (next) next.resume();
		}
		getActive() {
			return this.#scopeStack.current[0];
		}
		setFocusMemory(scope, element) {
			this.#focusHistory.set(scope, element);
		}
		getFocusMemory(scope) {
			return this.#focusHistory.get(scope);
		}
		isActiveScope(scope) {
			return this.getActive() === scope;
		}
		setPreFocusMemory(scope, element) {
			this.#preFocusHistory.set(scope, element);
		}
		getPreFocusMemory(scope) {
			return this.#preFocusHistory.get(scope);
		}
		clearPreFocusMemory(scope) {
			this.#preFocusHistory.delete(scope);
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/focus-scope/focus-scope.svelte.js
	var FocusScope = class FocusScope {
		#paused = false;
		#container = null;
		#manager = FocusScopeManager.getInstance();
		#cleanupFns = [];
		#opts;
		constructor(opts) {
			this.#opts = opts;
		}
		get paused() {
			return this.#paused;
		}
		pause() {
			this.#paused = true;
		}
		resume() {
			this.#paused = false;
		}
		#cleanup() {
			for (const fn of this.#cleanupFns) fn();
			this.#cleanupFns = [];
		}
		mount(container) {
			if (this.#container) this.unmount();
			this.#container = container;
			this.#manager.register(this);
			this.#setupEventListeners();
			this.#handleOpenAutoFocus();
		}
		unmount() {
			if (!this.#container) return;
			this.#cleanup();
			this.#handleCloseAutoFocus();
			this.#manager.unregister(this);
			this.#manager.clearPreFocusMemory(this);
			this.#container = null;
		}
		#handleOpenAutoFocus() {
			if (!this.#container) return;
			const event = new CustomEvent("focusScope.onOpenAutoFocus", {
				bubbles: false,
				cancelable: true
			});
			this.#opts.onOpenAutoFocus.current(event);
			if (!event.defaultPrevented) requestAnimationFrame(() => {
				if (!this.#container) return;
				const firstTabbable = this.#getFirstTabbable();
				if (firstTabbable) {
					firstTabbable.focus();
					this.#manager.setFocusMemory(this, firstTabbable);
				} else this.#container.focus();
			});
		}
		#handleCloseAutoFocus() {
			const event = new CustomEvent("focusScope.onCloseAutoFocus", {
				bubbles: false,
				cancelable: true
			});
			this.#opts.onCloseAutoFocus.current?.(event);
			if (!event.defaultPrevented) {
				const preFocusedElement = this.#manager.getPreFocusMemory(this);
				if (preFocusedElement && document.contains(preFocusedElement)) try {
					preFocusedElement.focus();
				} catch {
					document.body.focus();
				}
			}
		}
		#setupEventListeners() {
			if (!this.#container || !this.#opts.trap.current) return;
			const container = this.#container;
			const doc = container.ownerDocument;
			const handleFocus = (e) => {
				if (this.#paused || !this.#manager.isActiveScope(this)) return;
				const target = e.target;
				if (!target) return;
				if (container.contains(target)) this.#manager.setFocusMemory(this, target);
				else {
					const lastFocused = this.#manager.getFocusMemory(this);
					if (lastFocused && container.contains(lastFocused) && isFocusable(lastFocused)) {
						e.preventDefault();
						lastFocused.focus();
					} else {
						const firstTabbable = this.#getFirstTabbable();
						const firstFocusable = this.#getAllFocusables()[0];
						(firstTabbable || firstFocusable || container).focus();
					}
				}
			};
			const handleKeydown = (e) => {
				if (!this.#opts.loop || this.#paused || e.key !== "Tab") return;
				if (!this.#manager.isActiveScope(this)) return;
				const tabbables = this.#getTabbables();
				if (tabbables.length === 0) return;
				const first = tabbables[0];
				const last = tabbables[tabbables.length - 1];
				if (!e.shiftKey && doc.activeElement === last) {
					e.preventDefault();
					first.focus();
				} else if (e.shiftKey && doc.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			};
			this.#cleanupFns.push(on(doc, "focusin", handleFocus, { capture: true }), on(container, "keydown", handleKeydown));
			const observer = new MutationObserver(() => {
				const lastFocused = this.#manager.getFocusMemory(this);
				if (lastFocused && !container.contains(lastFocused)) {
					const firstTabbable = this.#getFirstTabbable();
					const firstFocusable = this.#getAllFocusables()[0];
					const elementToFocus = firstTabbable || firstFocusable;
					if (elementToFocus) {
						elementToFocus.focus();
						this.#manager.setFocusMemory(this, elementToFocus);
					} else container.focus();
				}
			});
			observer.observe(container, {
				childList: true,
				subtree: true
			});
			this.#cleanupFns.push(() => observer.disconnect());
		}
		#getTabbables() {
			if (!this.#container) return [];
			return tabbable(this.#container, {
				includeContainer: false,
				getShadowRoot: true
			});
		}
		#getFirstTabbable() {
			return this.#getTabbables()[0] || null;
		}
		#getAllFocusables() {
			if (!this.#container) return [];
			return focusable(this.#container, {
				includeContainer: false,
				getShadowRoot: true
			});
		}
		static use(opts) {
			let scope = null;
			watch([() => opts.ref.current, () => opts.enabled.current], ([ref, enabled]) => {
				if (ref && enabled) {
					if (!scope) scope = new FocusScope(opts);
					scope.mount(ref);
				} else if (scope) {
					scope.unmount();
					scope = null;
				}
			});
			onDestroyEffect(() => {
				scope?.unmount();
			});
			return { get props() {
				return { tabindex: -1 };
			} };
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/focus-scope/focus-scope.svelte
	function Focus_scope($$anchor, $$props) {
		push($$props, true);
		let enabled = prop($$props, "enabled", 3, false), trapFocus = prop($$props, "trapFocus", 3, false), loop = prop($$props, "loop", 3, false), onCloseAutoFocus = prop($$props, "onCloseAutoFocus", 3, noop), onOpenAutoFocus = prop($$props, "onOpenAutoFocus", 3, noop);
		const focusScopeState = FocusScope.use({
			enabled: boxWith(() => enabled()),
			trap: boxWith(() => trapFocus()),
			loop: loop(),
			onCloseAutoFocus: boxWith(() => onCloseAutoFocus()),
			onOpenAutoFocus: boxWith(() => onOpenAutoFocus()),
			ref: $$props.ref
		});
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.focusScope ?? noop$1, () => ({ props: focusScopeState.props }));
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/text-selection-layer/use-text-selection-layer.svelte.js
	var noopPointer = () => {};
	globalThis.bitsTextSelectionLayers ??= /* @__PURE__ */ new Map();
	var TextSelectionLayerState = class TextSelectionLayerState {
		static create(opts) {
			return new TextSelectionLayerState(opts);
		}
		opts;
		domContext;
		#unsubSelectionLock = noop;
		#enabledSnapshot = false;
		#onPointerDownSnapshot = noopPointer;
		#onPointerUpSnapshot = noopPointer;
		constructor(opts) {
			this.opts = opts;
			this.domContext = new DOMContext(opts.ref);
			let unsubEvents = noop;
			watch(() => [
				this.opts.enabled.current,
				this.opts.onPointerDown.current,
				this.opts.onPointerUp.current
			], ([enabled, onPointerDown, onPointerUp]) => {
				this.#enabledSnapshot = enabled;
				this.#onPointerDownSnapshot = onPointerDown;
				this.#onPointerUpSnapshot = onPointerUp;
				if (enabled) {
					globalThis.bitsTextSelectionLayers.set(this, this.opts.enabled);
					unsubEvents();
					unsubEvents = this.#addEventListeners();
				}
				return () => {
					this.#enabledSnapshot = false;
					unsubEvents();
					this.#resetSelectionLock();
					globalThis.bitsTextSelectionLayers.delete(this);
				};
			});
		}
		#addEventListeners() {
			return executeCallbacks(on(this.domContext.getDocument(), "pointerdown", this.#pointerdown), on(this.domContext.getDocument(), "pointerup", composeHandlers(this.#resetSelectionLock, this.#pointerupUserHandler)));
		}
		#pointerupUserHandler = (e) => {
			this.#onPointerUpSnapshot(e);
		};
		#pointerdown = (e) => {
			if (!this.#enabledSnapshot) return;
			const node = this.opts.ref.current;
			const target = e.target;
			if (!isHTMLElement$1(node) || !isHTMLElement$1(target)) return;
			/**
			* We only lock user-selection overflow if layer is the top most layer and
			* pointerdown occurred inside the node. You are still allowed to select text
			* outside the node provided pointerdown occurs outside the node.
			*/
			if (!isHighestLayer(this) || !contains(node, target)) return;
			this.#onPointerDownSnapshot(e);
			if (e.defaultPrevented) return;
			this.#unsubSelectionLock = preventTextSelectionOverflow(node, this.domContext.getDocument().body);
		};
		#resetSelectionLock = () => {
			this.#unsubSelectionLock();
			this.#unsubSelectionLock = noop;
		};
	};
	var getUserSelect = (node) => node.style.userSelect || node.style.webkitUserSelect;
	function preventTextSelectionOverflow(node, body) {
		const originalBodyUserSelect = getUserSelect(body);
		const originalNodeUserSelect = getUserSelect(node);
		setUserSelect(body, "none");
		setUserSelect(node, "text");
		return () => {
			setUserSelect(body, originalBodyUserSelect);
			setUserSelect(node, originalNodeUserSelect);
		};
	}
	function setUserSelect(node, value) {
		node.style.userSelect = value;
		node.style.webkitUserSelect = value;
	}
	function isHighestLayer(instance) {
		const layersArr = [...globalThis.bitsTextSelectionLayers];
		if (!layersArr.length) return false;
		const highestLayer = layersArr.at(-1);
		if (!highestLayer) return false;
		return highestLayer[0] === instance;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/text-selection-layer/text-selection-layer.svelte
	function Text_selection_layer($$anchor, $$props) {
		push($$props, true);
		let preventOverflowTextSelection = prop($$props, "preventOverflowTextSelection", 3, true), onPointerDown = prop($$props, "onPointerDown", 3, noop), onPointerUp = prop($$props, "onPointerUp", 3, noop);
		TextSelectionLayerState.create({
			id: boxWith(() => $$props.id),
			onPointerDown: boxWith(() => onPointerDown()),
			onPointerUp: boxWith(() => onPointerUp()),
			enabled: boxWith(() => $$props.enabled && preventOverflowTextSelection()),
			ref: $$props.ref
		});
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.children ?? noop$1);
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/use-id.js
	globalThis.bitsIdCounter ??= { current: 0 };
	/**
	* Generates a unique ID based on a global counter.
	*/
	function useId(prefix = "bits") {
		globalThis.bitsIdCounter.current++;
		return `${prefix}-${globalThis.bitsIdCounter.current}`;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/shared-state.svelte.js
	var SharedState = class {
		#factory;
		#subscribers = 0;
		#state = /* @__PURE__ */ state();
		#scope;
		constructor(factory) {
			this.#factory = factory;
		}
		#dispose() {
			this.#subscribers -= 1;
			if (this.#scope && this.#subscribers <= 0) {
				this.#scope();
				set(this.#state, void 0);
				this.#scope = void 0;
			}
		}
		get(...args) {
			this.#subscribers += 1;
			if (get$2(this.#state) === void 0) this.#scope = effect_root(() => {
				set(this.#state, this.#factory(...args), true);
			});
			user_effect(() => {
				return () => {
					this.#dispose();
				};
			});
			return get$2(this.#state);
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/body-scroll-lock.svelte.js
	var lockMap = new SvelteMap();
	var initialBodyStyle = /* @__PURE__ */ state(null);
	var stopTouchMoveListener = null;
	var cleanupTimeoutId = null;
	var isInCleanupTransition = false;
	var anyLocked = boxWith(() => {
		for (const value of lockMap.values()) if (value) return true;
		return false;
	});
	/**
	* We track the time we scheduled the cleanup to prevent race conditions
	* when multiple locks are created/destroyed in the same tick, ensuring
	* only the last one to schedule the cleanup will run.
	*
	* reference: https://github.com/huntabyte/bits-ui/issues/1639
	*/
	var cleanupScheduledAt = null;
	var bodyLockStackCount = new SharedState(() => {
		function resetBodyStyle(documentObj) {
			documentObj.body.setAttribute("style", get$2(initialBodyStyle) ?? "");
			documentObj.body.style.removeProperty("--scrollbar-width");
			isIOS && stopTouchMoveListener?.();
			set(initialBodyStyle, null);
		}
		function cancelPendingCleanup() {
			if (cleanupTimeoutId === null) return;
			window.clearTimeout(cleanupTimeoutId);
			cleanupTimeoutId = null;
		}
		function scheduleCleanupIfNoNewLocks(delay, callback) {
			cancelPendingCleanup();
			isInCleanupTransition = true;
			cleanupScheduledAt = Date.now();
			const currentCleanupId = cleanupScheduledAt;
			/**
			* We schedule the cleanup to run after a delay to allow new locks to register
			* that might have been added in the same tick as the current cleanup.
			*
			* If a new lock is added in the same tick, the cleanup will be cancelled and
			* a new cleanup will be scheduled.
			*
			* This is to prevent the cleanup from running too early and resetting the body
			* style before the new lock has had a chance to apply its styles.
			*/
			const cleanupFn = () => {
				cleanupTimeoutId = null;
				if (cleanupScheduledAt !== currentCleanupId) return;
				if (!isAnyLocked(lockMap)) {
					isInCleanupTransition = false;
					callback();
				} else isInCleanupTransition = false;
			};
			const actualDelay = delay === null ? 24 : delay;
			cleanupTimeoutId = window.setTimeout(cleanupFn, actualDelay);
		}
		function ensureInitialStyleCaptured() {
			if (get$2(initialBodyStyle) === null && lockMap.size === 0 && !isInCleanupTransition) set(initialBodyStyle, document.body.getAttribute("style"), true);
		}
		watch(() => anyLocked.current, () => {
			if (!anyLocked.current) return;
			ensureInitialStyleCaptured();
			isInCleanupTransition = false;
			const htmlStyle = getComputedStyle(document.documentElement);
			const bodyStyle = getComputedStyle(document.body);
			const hasStableGutter = htmlStyle.scrollbarGutter?.includes("stable") || bodyStyle.scrollbarGutter?.includes("stable");
			const verticalScrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
			const config = {
				padding: Number.parseInt(bodyStyle.paddingRight ?? "0", 10) + verticalScrollbarWidth,
				margin: Number.parseInt(bodyStyle.marginRight ?? "0", 10)
			};
			if (verticalScrollbarWidth > 0 && !hasStableGutter) {
				document.body.style.paddingRight = `${config.padding}px`;
				document.body.style.marginRight = `${config.margin}px`;
				document.body.style.setProperty("--scrollbar-width", `${verticalScrollbarWidth}px`);
			}
			document.body.style.overflow = "hidden";
			if (isIOS) stopTouchMoveListener = on(document, "touchmove", (e) => {
				if (e.target !== document.documentElement) return;
				if (e.touches.length > 1) return;
				e.preventDefault();
			}, { passive: false });
			/**
			* We ensure pointer-events: none is applied _after_ DOM updates, so that any focus/
			* interaction changes from opening overlays/menus complete _before_ we block pointer
			* events.
			*
			* this avoids race conditions where pointer-events could be set too early and break
			* focus/interaction.
			*/
			afterTick(() => {
				document.body.style.pointerEvents = "none";
				document.body.style.overflow = "hidden";
			});
		});
		onDestroyEffect(() => {
			return () => {
				stopTouchMoveListener?.();
			};
		});
		return {
			get lockMap() {
				return lockMap;
			},
			resetBodyStyle,
			scheduleCleanupIfNoNewLocks,
			cancelPendingCleanup,
			ensureInitialStyleCaptured
		};
	});
	var BodyScrollLock = class {
		#id = useId();
		#initialState;
		#restoreScrollDelay = () => null;
		#countState;
		locked;
		constructor(initialState, restoreScrollDelay = () => null) {
			this.#initialState = initialState;
			this.#restoreScrollDelay = restoreScrollDelay;
			this.#countState = bodyLockStackCount.get();
			if (!this.#countState) return;
			/**
			* Since a new lock is being created, we cancel any pending cleanup to
			* prevent the cleanup from running too early and resetting the body style
			* before the new lock has had a chance to apply its styles.
			*
			* reference: https://github.com/huntabyte/bits-ui/issues/1639
			*/
			this.#countState.cancelPendingCleanup();
			this.#countState.ensureInitialStyleCaptured();
			this.#countState.lockMap.set(this.#id, this.#initialState ?? false);
			this.locked = boxWith(() => this.#countState.lockMap.get(this.#id) ?? false, (v) => this.#countState.lockMap.set(this.#id, v));
			onDestroyEffect(() => {
				this.#countState.lockMap.delete(this.#id);
				if (isAnyLocked(this.#countState.lockMap)) return;
				const restoreScrollDelay = this.#restoreScrollDelay();
				const documentObj = document;
				/**
				* We schedule the cleanup to run after a delay to handle same-tick
				* destroy/create scenarios.
				*
				* reference: https://github.com/huntabyte/bits-ui/issues/1639
				*/
				this.#countState.scheduleCleanupIfNoNewLocks(restoreScrollDelay, () => {
					this.#countState.resetBodyStyle(documentObj);
				});
			});
		}
	};
	function isAnyLocked(map) {
		for (const [_, value] of map) if (value) return true;
		return false;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/scroll-lock/scroll-lock.svelte
	function Scroll_lock($$anchor, $$props) {
		push($$props, true);
		let preventScroll = prop($$props, "preventScroll", 3, true), restoreScrollDelay = prop($$props, "restoreScrollDelay", 3, null);
		if (preventScroll()) new BodyScrollLock(preventScroll(), () => restoreScrollDelay());
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/config/components/bits-config.svelte
	function Bits_config($$anchor, $$props) {
		push($$props, true);
		useBitsConfig({
			defaultPortalTo: boxWith(() => $$props.defaultPortalTo),
			defaultLocale: boxWith(() => $$props.defaultLocale)
		});
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.children ?? noop$1);
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/svelte/src/internal/flags/legacy.js
	enable_legacy_mode_flag();
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/hidden-input.svelte
	var rest_excludes$31 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"value"
	]);
	var root$34 = /* @__PURE__ */ from_tree([["input"]]);
	var root_1$16 = /* @__PURE__ */ from_tree([["input"]]);
	function Hidden_input($$anchor, $$props) {
		push($$props, true);
		let value = prop($$props, "value", 15), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$31);
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, {
			"aria-hidden": "true",
			tabindex: -1,
			style: {
				...srOnlyStyles,
				position: "absolute",
				top: "0",
				left: "0"
			}
		}));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var input = root$34();
			attribute_effect(input, () => ({
				...get$2(mergedProps),
				value: value()
			}), void 0, void 0, void 0, void 0, true);
			append($$anchor, input);
		};
		var alternate = ($$anchor) => {
			var input_1 = root_1$16();
			attribute_effect(input_1, () => ({ ...get$2(mergedProps) }), void 0, void 0, void 0, void 0, true);
			bind_value(input_1, value);
			append($$anchor, input_1);
		};
		if_block(node, ($$render) => {
			if (get$2(mergedProps).type === "checkbox") $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
	/**
	* Custom positioning reference element.
	* @see https://floating-ui.com/docs/virtual-elements
	*/
	var sides = [
		"top",
		"right",
		"bottom",
		"left"
	];
	var min = Math.min;
	var max = Math.max;
	var round = Math.round;
	var floor = Math.floor;
	var createCoords = (v) => ({
		x: v,
		y: v
	});
	var oppositeSideMap = {
		left: "right",
		right: "left",
		bottom: "top",
		top: "bottom"
	};
	function clamp(start, value, end) {
		return max(start, min(value, end));
	}
	function evaluate(value, param) {
		return typeof value === "function" ? value(param) : value;
	}
	function getSide$1(placement) {
		return placement.split("-")[0];
	}
	function getAlignment(placement) {
		return placement.split("-")[1];
	}
	function getOppositeAxis(axis) {
		return axis === "x" ? "y" : "x";
	}
	function getAxisLength(axis) {
		return axis === "y" ? "height" : "width";
	}
	function getSideAxis(placement) {
		const firstChar = placement[0];
		return firstChar === "t" || firstChar === "b" ? "y" : "x";
	}
	function getAlignmentAxis(placement) {
		return getOppositeAxis(getSideAxis(placement));
	}
	function getAlignmentSides(placement, rects, rtl) {
		if (rtl === void 0) rtl = false;
		const alignment = getAlignment(placement);
		const alignmentAxis = getAlignmentAxis(placement);
		const length = getAxisLength(alignmentAxis);
		let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
		if (rects.reference[length] > rects.floating[length]) mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
		return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
	}
	function getExpandedPlacements(placement) {
		const oppositePlacement = getOppositePlacement(placement);
		return [
			getOppositeAlignmentPlacement(placement),
			oppositePlacement,
			getOppositeAlignmentPlacement(oppositePlacement)
		];
	}
	function getOppositeAlignmentPlacement(placement) {
		return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
	}
	var lrPlacement = ["left", "right"];
	var rlPlacement = ["right", "left"];
	var tbPlacement = ["top", "bottom"];
	var btPlacement = ["bottom", "top"];
	function getSideList(side, isStart, rtl) {
		switch (side) {
			case "top":
			case "bottom":
				if (rtl) return isStart ? rlPlacement : lrPlacement;
				return isStart ? lrPlacement : rlPlacement;
			case "left":
			case "right": return isStart ? tbPlacement : btPlacement;
			default: return [];
		}
	}
	function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
		const alignment = getAlignment(placement);
		let list = getSideList(getSide$1(placement), direction === "start", rtl);
		if (alignment) {
			list = list.map((side) => side + "-" + alignment);
			if (flipAlignment) list = list.concat(list.map(getOppositeAlignmentPlacement));
		}
		return list;
	}
	function getOppositePlacement(placement) {
		const side = getSide$1(placement);
		return oppositeSideMap[side] + placement.slice(side.length);
	}
	function expandPaddingObject(padding) {
		var _padding$top, _padding$right, _padding$bottom, _padding$left;
		return {
			top: (_padding$top = padding.top) != null ? _padding$top : 0,
			right: (_padding$right = padding.right) != null ? _padding$right : 0,
			bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
			left: (_padding$left = padding.left) != null ? _padding$left : 0
		};
	}
	function getPaddingObject(padding) {
		return typeof padding !== "number" ? expandPaddingObject(padding) : {
			top: padding,
			right: padding,
			bottom: padding,
			left: padding
		};
	}
	function rectToClientRect(rect) {
		const { x, y, width, height } = rect;
		return {
			width,
			height,
			top: y,
			left: x,
			right: x + width,
			bottom: y + height,
			x,
			y
		};
	}
	//#endregion
	//#region node_modules/@floating-ui/core/dist/floating-ui.core.mjs
	function computeCoordsFromPlacement(_ref, placement, rtl) {
		let { reference, floating } = _ref;
		const sideAxis = getSideAxis(placement);
		const alignmentAxis = getAlignmentAxis(placement);
		const alignLength = getAxisLength(alignmentAxis);
		const side = getSide$1(placement);
		const isVertical = sideAxis === "y";
		const commonX = reference.x + reference.width / 2 - floating.width / 2;
		const commonY = reference.y + reference.height / 2 - floating.height / 2;
		const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
		let coords;
		switch (side) {
			case "top":
				coords = {
					x: commonX,
					y: reference.y - floating.height
				};
				break;
			case "bottom":
				coords = {
					x: commonX,
					y: reference.y + reference.height
				};
				break;
			case "right":
				coords = {
					x: reference.x + reference.width,
					y: commonY
				};
				break;
			case "left":
				coords = {
					x: reference.x - floating.width,
					y: commonY
				};
				break;
			default: coords = {
				x: reference.x,
				y: reference.y
			};
		}
		const alignment = getAlignment(placement);
		if (alignment) coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
		return coords;
	}
	/**
	* Resolves with an object of overflow side offsets that determine how much the
	* element is overflowing a given clipping boundary on each side.
	* - positive = overflowing the boundary by that number of pixels
	* - negative = how many pixels left before it will overflow
	* - 0 = lies flush with the boundary
	* @see https://floating-ui.com/docs/detectOverflow
	*/
	async function detectOverflow(state, options) {
		var _await$platform$isEle;
		if (options === void 0) options = {};
		const { x, y, platform, rects, elements, strategy } = state;
		const { boundary = "clippingAncestors", rootBoundary = "viewport", elementContext = "floating", altBoundary = false, padding = 0 } = evaluate(options, state);
		const paddingObject = getPaddingObject(padding);
		const element = elements[altBoundary ? elementContext === "floating" ? "reference" : "floating" : elementContext];
		const clippingClientRect = rectToClientRect(await platform.getClippingRect({
			element: ((_await$platform$isEle = await (platform.isElement == null ? void 0 : platform.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform.getDocumentElement == null ? void 0 : platform.getDocumentElement(elements.floating)),
			boundary,
			rootBoundary,
			strategy
		}));
		const rect = elementContext === "floating" ? {
			x,
			y,
			width: rects.floating.width,
			height: rects.floating.height
		} : rects.reference;
		const offsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(elements.floating));
		const offsetScale = await (platform.isElement == null ? void 0 : platform.isElement(offsetParent)) && await (platform.getScale == null ? void 0 : platform.getScale(offsetParent)) || {
			x: 1,
			y: 1
		};
		const elementClientRect = rectToClientRect(platform.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform.convertOffsetParentRelativeRectToViewportRelativeRect({
			elements,
			rect,
			offsetParent,
			strategy
		}) : rect);
		return {
			top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
			bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
			left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
			right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
		};
	}
	var MAX_RESET_COUNT = 50;
	/**
	* Computes the `x` and `y` coordinates that will place the floating element
	* next to a given reference element.
	*
	* This export does not have any `platform` interface logic. You will need to
	* write one for the platform you are using Floating UI with.
	*/
	var computePosition$1 = async (reference, floating, config) => {
		const { placement = "bottom", strategy = "absolute", middleware = [], platform } = config;
		const platformWithDetectOverflow = platform.detectOverflow ? platform : {
			...platform,
			detectOverflow
		};
		const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(floating));
		let rects = await platform.getElementRects({
			reference,
			floating,
			strategy
		});
		let { x, y } = computeCoordsFromPlacement(rects, placement, rtl);
		let statefulPlacement = placement;
		let resetCount = 0;
		const middlewareData = {};
		for (let i = 0; i < middleware.length; i++) {
			const currentMiddleware = middleware[i];
			if (!currentMiddleware) continue;
			const { name, fn } = currentMiddleware;
			const { x: nextX, y: nextY, data, reset } = await fn({
				x,
				y,
				initialPlacement: placement,
				placement: statefulPlacement,
				strategy,
				middlewareData,
				rects,
				platform: platformWithDetectOverflow,
				elements: {
					reference,
					floating
				}
			});
			x = nextX != null ? nextX : x;
			y = nextY != null ? nextY : y;
			middlewareData[name] = {
				...middlewareData[name],
				...data
			};
			if (reset && resetCount < MAX_RESET_COUNT) {
				resetCount++;
				if (typeof reset === "object") {
					if (reset.placement) statefulPlacement = reset.placement;
					if (reset.rects) rects = reset.rects === true ? await platform.getElementRects({
						reference,
						floating,
						strategy
					}) : reset.rects;
					({x, y} = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
				}
				i = -1;
			}
		}
		return {
			x,
			y,
			placement: statefulPlacement,
			strategy,
			middlewareData
		};
	};
	/**
	* Provides data to position an inner element of the floating element so that it
	* appears centered to the reference element.
	* @see https://floating-ui.com/docs/arrow
	*/
	var arrow$1 = (options) => ({
		name: "arrow",
		options,
		async fn(state) {
			const { x, y, placement, rects, platform, elements, middlewareData } = state;
			const { element, padding = 0 } = evaluate(options, state) || {};
			if (element == null) return {};
			const paddingObject = getPaddingObject(padding);
			const coords = {
				x,
				y
			};
			const axis = getAlignmentAxis(placement);
			const length = getAxisLength(axis);
			const arrowDimensions = await platform.getDimensions(element);
			const isYAxis = axis === "y";
			const minProp = isYAxis ? "top" : "left";
			const maxProp = isYAxis ? "bottom" : "right";
			const clientProp = isYAxis ? "clientHeight" : "clientWidth";
			const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
			const startDiff = coords[axis] - rects.reference[axis];
			const arrowOffsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(element));
			let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
			if (!clientSize || !await (platform.isElement == null ? void 0 : platform.isElement(arrowOffsetParent))) clientSize = elements.floating[clientProp] || rects.floating[length];
			const centerToReference = endDiff / 2 - startDiff / 2;
			const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
			const minPadding = min(paddingObject[minProp], largestPossiblePadding);
			const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
			const max = clientSize - arrowDimensions[length] - maxPadding;
			const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
			const offset = clamp(minPadding, center, max);
			const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset && rects.reference[length] / 2 - (center < minPadding ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
			const alignmentOffset = shouldAddOffset ? center < minPadding ? center - minPadding : center - max : 0;
			return {
				[axis]: coords[axis] + alignmentOffset,
				data: {
					[axis]: offset,
					centerOffset: center - offset - alignmentOffset,
					...shouldAddOffset && { alignmentOffset }
				},
				reset: shouldAddOffset
			};
		}
	});
	/**
	* Optimizes the visibility of the floating element by flipping the `placement`
	* in order to keep it in view when the preferred placement(s) will overflow the
	* clipping boundary. Alternative to `autoPlacement`.
	* @see https://floating-ui.com/docs/flip
	*/
	var flip$1 = function(options) {
		if (options === void 0) options = {};
		return {
			name: "flip",
			options,
			async fn(state) {
				var _middlewareData$arrow, _middlewareData$flip;
				const { placement, middlewareData, rects, initialPlacement, platform, elements } = state;
				const { mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = true, fallbackPlacements: specifiedFallbackPlacements, fallbackStrategy = "bestFit", fallbackAxisSideDirection = "none", flipAlignment = true, ...detectOverflowOptions } = evaluate(options, state);
				if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) return {};
				const side = getSide$1(placement);
				const initialSideAxis = getSideAxis(initialPlacement);
				const isBasePlacement = getSide$1(initialPlacement) === initialPlacement;
				const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
				const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
				const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
				if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
				const placements = [initialPlacement, ...fallbackPlacements];
				const overflow = await platform.detectOverflow(state, detectOverflowOptions);
				const overflows = [];
				let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
				if (checkMainAxis) overflows.push(overflow[side]);
				if (checkCrossAxis) {
					const sides = getAlignmentSides(placement, rects, rtl);
					overflows.push(overflow[sides[0]], overflow[sides[1]]);
				}
				overflowsData = [...overflowsData, {
					placement,
					overflows
				}];
				if (!overflows.every((side) => side <= 0)) {
					var _middlewareData$flip2, _overflowsData$filter;
					const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
					const nextPlacement = placements[nextIndex];
					if (nextPlacement) {
						if (!(checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false) || overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) return {
							data: {
								index: nextIndex,
								overflows: overflowsData
							},
							reset: { placement: nextPlacement }
						};
					}
					let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
					if (!resetPlacement) switch (fallbackStrategy) {
						case "bestFit": {
							var _overflowsData$filter2;
							const placement = (_overflowsData$filter2 = overflowsData.filter((d) => {
								if (hasFallbackAxisSideDirection) {
									const currentSideAxis = getSideAxis(d.placement);
									return currentSideAxis === initialSideAxis || currentSideAxis === "y";
								}
								return true;
							}).map((d) => [d.placement, d.overflows.filter((overflow) => overflow > 0).reduce((acc, overflow) => acc + overflow, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
							if (placement) resetPlacement = placement;
							break;
						}
						case "initialPlacement": resetPlacement = initialPlacement;
					}
					if (placement !== resetPlacement) return { reset: { placement: resetPlacement } };
				}
				return {};
			}
		};
	};
	function getSideOffsets(overflow, rect) {
		return {
			top: overflow.top - rect.height,
			right: overflow.right - rect.width,
			bottom: overflow.bottom - rect.height,
			left: overflow.left - rect.width
		};
	}
	function isAnySideFullyClipped(overflow) {
		return sides.some((side) => overflow[side] >= 0);
	}
	/**
	* Provides data to hide the floating element in applicable situations, such as
	* when it is not in the same clipping context as the reference element.
	* @see https://floating-ui.com/docs/hide
	*/
	var hide$1 = function(options) {
		if (options === void 0) options = {};
		return {
			name: "hide",
			options,
			async fn(state) {
				const { rects, platform } = state;
				const { strategy = "referenceHidden", ...detectOverflowOptions } = evaluate(options, state);
				switch (strategy) {
					case "referenceHidden": {
						const offsets = getSideOffsets(await platform.detectOverflow(state, {
							...detectOverflowOptions,
							elementContext: "reference"
						}), rects.reference);
						return { data: {
							referenceHiddenOffsets: offsets,
							referenceHidden: isAnySideFullyClipped(offsets)
						} };
					}
					case "escaped": {
						const offsets = getSideOffsets(await platform.detectOverflow(state, {
							...detectOverflowOptions,
							altBoundary: true
						}), rects.floating);
						return { data: {
							escapedOffsets: offsets,
							escaped: isAnySideFullyClipped(offsets)
						} };
					}
					default: return {};
				}
			}
		};
	};
	var originSides = /*#__PURE__*/ new Set(["left", "top"]);
	async function convertValueToCoords(state, options) {
		const { placement, platform, elements } = state;
		const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
		const side = getSide$1(placement);
		const alignment = getAlignment(placement);
		const isVertical = getSideAxis(placement) === "y";
		const mainAxisMulti = originSides.has(side) ? -1 : 1;
		const crossAxisMulti = rtl && isVertical ? -1 : 1;
		const rawValue = evaluate(options, state);
		let { mainAxis, crossAxis, alignmentAxis } = typeof rawValue === "number" ? {
			mainAxis: rawValue,
			crossAxis: 0,
			alignmentAxis: null
		} : {
			mainAxis: rawValue.mainAxis || 0,
			crossAxis: rawValue.crossAxis || 0,
			alignmentAxis: rawValue.alignmentAxis
		};
		if (alignment && typeof alignmentAxis === "number") crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
		return isVertical ? {
			x: crossAxis * crossAxisMulti,
			y: mainAxis * mainAxisMulti
		} : {
			x: mainAxis * mainAxisMulti,
			y: crossAxis * crossAxisMulti
		};
	}
	/**
	* Modifies the placement by translating the floating element along the
	* specified axes.
	* A number (shorthand for `mainAxis` or distance), or an axes configuration
	* object may be passed.
	* @see https://floating-ui.com/docs/offset
	*/
	var offset$1 = function(options) {
		if (options === void 0) options = 0;
		return {
			name: "offset",
			options,
			async fn(state) {
				var _middlewareData$offse, _middlewareData$arrow;
				const { x, y, placement, middlewareData } = state;
				const diffCoords = await convertValueToCoords(state, options);
				if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) return {};
				return {
					x: x + diffCoords.x,
					y: y + diffCoords.y,
					data: {
						...diffCoords,
						placement
					}
				};
			}
		};
	};
	/**
	* Optimizes the visibility of the floating element by shifting it in order to
	* keep it in view when it will overflow the clipping boundary.
	* @see https://floating-ui.com/docs/shift
	*/
	var shift$1 = function(options) {
		if (options === void 0) options = {};
		return {
			name: "shift",
			options,
			async fn(state) {
				const { x, y, placement, platform } = state;
				const { mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = false, limiter = { fn: (_ref) => {
					let { x, y } = _ref;
					return {
						x,
						y
					};
				} }, ...detectOverflowOptions } = evaluate(options, state);
				const coords = {
					x,
					y
				};
				const overflow = await platform.detectOverflow(state, detectOverflowOptions);
				const crossAxis = getSideAxis(placement);
				const mainAxis = getOppositeAxis(crossAxis);
				let mainAxisCoord = coords[mainAxis];
				let crossAxisCoord = coords[crossAxis];
				const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
				if (checkMainAxis) mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
				if (checkCrossAxis) crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
				const limitedCoords = limiter.fn({
					...state,
					[mainAxis]: mainAxisCoord,
					[crossAxis]: crossAxisCoord
				});
				return {
					...limitedCoords,
					data: {
						x: limitedCoords.x - x,
						y: limitedCoords.y - y,
						enabled: {
							[mainAxis]: checkMainAxis,
							[crossAxis]: checkCrossAxis
						}
					}
				};
			}
		};
	};
	/**
	* Built-in `limiter` that will stop `shift()` at a certain point.
	*/
	var limitShift$1 = function(options) {
		if (options === void 0) options = {};
		return {
			options,
			fn(state) {
				var _rawOffset$mainAxis, _rawOffset$crossAxis;
				const { x, y, placement, rects, middlewareData } = state;
				const { offset = 0, mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = true } = evaluate(options, state);
				const coords = {
					x,
					y
				};
				const crossAxis = getSideAxis(placement);
				const mainAxis = getOppositeAxis(crossAxis);
				let mainAxisCoord = coords[mainAxis];
				let crossAxisCoord = coords[crossAxis];
				const rawOffset = evaluate(offset, state);
				const computedOffset = typeof rawOffset === "number" ? {
					mainAxis: rawOffset,
					crossAxis: 0
				} : {
					mainAxis: (_rawOffset$mainAxis = rawOffset.mainAxis) != null ? _rawOffset$mainAxis : 0,
					crossAxis: (_rawOffset$crossAxis = rawOffset.crossAxis) != null ? _rawOffset$crossAxis : 0
				};
				if (checkMainAxis) {
					const len = mainAxis === "y" ? "height" : "width";
					const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
					const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
					if (mainAxisCoord < limitMin) mainAxisCoord = limitMin;
					else if (mainAxisCoord > limitMax) mainAxisCoord = limitMax;
				}
				if (checkCrossAxis) {
					var _middlewareData$offse, _middlewareData$offse2;
					const len = mainAxis === "y" ? "width" : "height";
					const isOriginSide = originSides.has(getSide$1(placement));
					const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
					const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
					if (crossAxisCoord < limitMin) crossAxisCoord = limitMin;
					else if (crossAxisCoord > limitMax) crossAxisCoord = limitMax;
				}
				return {
					[mainAxis]: mainAxisCoord,
					[crossAxis]: crossAxisCoord
				};
			}
		};
	};
	/**
	* Provides data that allows you to change the size of the floating element —
	* for instance, prevent it from overflowing the clipping boundary or match the
	* width of the reference element.
	* @see https://floating-ui.com/docs/size
	*/
	var size$1 = function(options) {
		if (options === void 0) options = {};
		return {
			name: "size",
			options,
			async fn(state) {
				const { placement, rects, platform, elements } = state;
				const { apply = () => {}, ...detectOverflowOptions } = evaluate(options, state);
				const overflow = await platform.detectOverflow(state, detectOverflowOptions);
				const side = getSide$1(placement);
				const alignment = getAlignment(placement);
				const isYAxis = getSideAxis(placement) === "y";
				const { width, height } = rects.floating;
				let heightSide;
				let widthSide;
				if (side === "top" || side === "bottom") {
					heightSide = side;
					widthSide = alignment === (await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
				} else {
					widthSide = side;
					heightSide = alignment === "end" ? "top" : "bottom";
				}
				const maximumClippingHeight = height - overflow.top - overflow.bottom;
				const maximumClippingWidth = width - overflow.left - overflow.right;
				const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
				const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
				const shiftData = state.middlewareData.shift;
				const noShift = !shiftData;
				let availableHeight = overflowAvailableHeight;
				let availableWidth = overflowAvailableWidth;
				if (shiftData != null && shiftData.enabled.x) availableWidth = maximumClippingWidth;
				if (shiftData != null && shiftData.enabled.y) availableHeight = maximumClippingHeight;
				if (noShift && !alignment) {
					if (isYAxis) availableWidth = width - 2 * max(overflow.left, overflow.right);
					else availableHeight = height - 2 * max(overflow.top, overflow.bottom);
				}
				await apply({
					...state,
					availableWidth,
					availableHeight
				});
				const nextDimensions = await platform.getDimensions(elements.floating);
				if (width !== nextDimensions.width || height !== nextDimensions.height) return { reset: { rects: true } };
				return {};
			}
		};
	};
	//#endregion
	//#region node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
	function hasWindow() {
		return typeof window !== "undefined";
	}
	function getNodeName(node) {
		if (isNode(node)) return (node.nodeName || "").toLowerCase();
		return "#document";
	}
	function getWindow(node) {
		var _node$ownerDocument;
		return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
	}
	function getDocumentElement(node) {
		var _ref;
		return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
	}
	function isNode(value) {
		if (!hasWindow()) return false;
		return value instanceof Node || value instanceof getWindow(value).Node;
	}
	function isElement(value) {
		if (!hasWindow()) return false;
		return value instanceof Element || value instanceof getWindow(value).Element;
	}
	function isHTMLElement(value) {
		if (!hasWindow()) return false;
		return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
	}
	function isShadowRoot(value) {
		if (!hasWindow() || typeof ShadowRoot === "undefined") return false;
		return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
	}
	function isOverflowElement(element) {
		const { overflow, overflowX, overflowY, display } = getComputedStyle$1(element);
		return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
	}
	function isTableElement(element) {
		return /^(table|td|th)$/.test(getNodeName(element));
	}
	function isTopLayer(element) {
		try {
			if (element.matches(":popover-open")) return true;
		} catch (_e) {}
		try {
			return element.matches(":modal");
		} catch (_e) {
			return false;
		}
	}
	var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
	var containRe = /paint|layout|strict|content/;
	var isNotNone = (value) => !!value && value !== "none";
	var isWebKitValue;
	function isContainingBlock(elementOrCss) {
		const css = isElement(elementOrCss) ? getComputedStyle$1(elementOrCss) : elementOrCss;
		return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
	}
	function getContainingBlock(element) {
		let currentNode = getParentNode(element);
		while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
			if (isContainingBlock(currentNode)) return currentNode;
			else if (isTopLayer(currentNode)) return null;
			currentNode = getParentNode(currentNode);
		}
		return null;
	}
	function isWebKit() {
		if (isWebKitValue == null) isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
		return isWebKitValue;
	}
	function isLastTraversableNode(node) {
		return /^(html|body|#document)$/.test(getNodeName(node));
	}
	function getComputedStyle$1(element) {
		return getWindow(element).getComputedStyle(element);
	}
	function getNodeScroll(element) {
		if (isElement(element)) return {
			scrollLeft: element.scrollLeft,
			scrollTop: element.scrollTop
		};
		return {
			scrollLeft: element.scrollX,
			scrollTop: element.scrollY
		};
	}
	function getParentNode(node) {
		if (getNodeName(node) === "html") return node;
		const result = node.assignedSlot || node.parentNode || isShadowRoot(node) && node.host || getDocumentElement(node);
		return isShadowRoot(result) ? result.host : result;
	}
	function getNearestOverflowAncestor(node) {
		const parentNode = getParentNode(node);
		if (isLastTraversableNode(parentNode)) return (node.ownerDocument || node).body;
		if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) return parentNode;
		return getNearestOverflowAncestor(parentNode);
	}
	function getOverflowAncestors(node, list, traverseIframes) {
		var _node$ownerDocument2;
		if (list === void 0) list = [];
		if (traverseIframes === void 0) traverseIframes = true;
		const scrollableAncestor = getNearestOverflowAncestor(node);
		const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
		const win = getWindow(scrollableAncestor);
		if (isBody) {
			const frameElement = getFrameElement(win);
			return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
		} else return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
	}
	function getFrameElement(win) {
		return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
	}
	//#endregion
	//#region node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
	function getCssDimensions(element) {
		const css = getComputedStyle$1(element);
		let width = parseFloat(css.width) || 0;
		let height = parseFloat(css.height) || 0;
		const hasOffset = isHTMLElement(element);
		const offsetWidth = hasOffset ? element.offsetWidth : width;
		const offsetHeight = hasOffset ? element.offsetHeight : height;
		const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
		if (shouldFallback) {
			width = offsetWidth;
			height = offsetHeight;
		}
		return {
			width,
			height,
			$: shouldFallback
		};
	}
	function unwrapElement(element) {
		return !isElement(element) ? element.contextElement : element;
	}
	function getScale(element) {
		const domElement = unwrapElement(element);
		if (!isHTMLElement(domElement)) return createCoords(1);
		const rect = domElement.getBoundingClientRect();
		const { width, height, $ } = getCssDimensions(domElement);
		let x = ($ ? round(rect.width) : rect.width) / width;
		let y = ($ ? round(rect.height) : rect.height) / height;
		if (!x || !Number.isFinite(x)) x = 1;
		if (!y || !Number.isFinite(y)) y = 1;
		return {
			x,
			y
		};
	}
	var noOffsets = /*#__PURE__*/ createCoords(0);
	function getVisualOffsets(element) {
		const win = getWindow(element);
		if (!isWebKit() || !win.visualViewport) return noOffsets;
		return {
			x: win.visualViewport.offsetLeft,
			y: win.visualViewport.offsetTop
		};
	}
	function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
		if (isFixed === void 0) isFixed = false;
		return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
	}
	function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
		if (includeScale === void 0) includeScale = false;
		if (isFixedStrategy === void 0) isFixedStrategy = false;
		const clientRect = element.getBoundingClientRect();
		const domElement = unwrapElement(element);
		let scale = createCoords(1);
		if (includeScale) {
			if (offsetParent) {
				if (isElement(offsetParent)) scale = getScale(offsetParent);
			} else scale = getScale(element);
		}
		const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
		let x = (clientRect.left + visualOffsets.x) / scale.x;
		let y = (clientRect.top + visualOffsets.y) / scale.y;
		let width = clientRect.width / scale.x;
		let height = clientRect.height / scale.y;
		if (domElement && offsetParent) {
			const win = getWindow(domElement);
			const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
			let currentWin = win;
			let currentIFrame = getFrameElement(currentWin);
			while (currentIFrame && offsetWin !== currentWin) {
				const iframeScale = getScale(currentIFrame);
				const iframeRect = currentIFrame.getBoundingClientRect();
				const css = getComputedStyle$1(currentIFrame);
				const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
				const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
				x *= iframeScale.x;
				y *= iframeScale.y;
				width *= iframeScale.x;
				height *= iframeScale.y;
				x += left;
				y += top;
				currentWin = getWindow(currentIFrame);
				currentIFrame = getFrameElement(currentWin);
			}
		}
		return rectToClientRect({
			width,
			height,
			x,
			y
		});
	}
	function getWindowScrollBarX(element, rect) {
		const leftScroll = getNodeScroll(element).scrollLeft;
		if (!rect) return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
		return rect.left + leftScroll;
	}
	function getHTMLOffset(documentElement, scroll) {
		const htmlRect = documentElement.getBoundingClientRect();
		return {
			x: htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect),
			y: htmlRect.top + scroll.scrollTop
		};
	}
	function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
		let { elements, rect, offsetParent, strategy } = _ref;
		const isFixed = strategy === "fixed";
		const documentElement = getDocumentElement(offsetParent);
		const topLayer = elements ? isTopLayer(elements.floating) : false;
		if (offsetParent === documentElement || topLayer && isFixed) return rect;
		let scroll = {
			scrollLeft: 0,
			scrollTop: 0
		};
		let scale = createCoords(1);
		const offsets = createCoords(0);
		const isOffsetParentAnElement = isHTMLElement(offsetParent);
		if (isOffsetParentAnElement || !isFixed) {
			if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) scroll = getNodeScroll(offsetParent);
			if (isOffsetParentAnElement) {
				const offsetRect = getBoundingClientRect(offsetParent);
				scale = getScale(offsetParent);
				offsets.x = offsetRect.x + offsetParent.clientLeft;
				offsets.y = offsetRect.y + offsetParent.clientTop;
			}
		}
		const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
		return {
			width: rect.width * scale.x,
			height: rect.height * scale.y,
			x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
			y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
		};
	}
	function getClientRects(element) {
		return element.getClientRects ? Array.from(element.getClientRects()) : [];
	}
	function getDocumentRect(html) {
		const scroll = getNodeScroll(html);
		const body = html.ownerDocument.body;
		const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
		const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
		let x = -scroll.scrollLeft + getWindowScrollBarX(html);
		const y = -scroll.scrollTop;
		if (getComputedStyle$1(body).direction === "rtl") x += max(html.clientWidth, body.clientWidth) - width;
		return {
			width,
			height,
			x,
			y
		};
	}
	var SCROLLBAR_MAX = 25;
	function getViewportRect(element, strategy, rootBoundary) {
		if (rootBoundary === void 0) rootBoundary = "viewport";
		const isLayoutViewport = rootBoundary === "layoutViewport";
		const win = getWindow(element);
		const html = getDocumentElement(element);
		const visualViewport = win.visualViewport;
		let width = html.clientWidth;
		let height = html.clientHeight;
		let x = 0;
		let y = 0;
		if (visualViewport) {
			const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
			if (isLayoutViewport) {
				if (!layoutRelativeClientCoords) {
					x = -visualViewport.offsetLeft;
					y = -visualViewport.offsetTop;
				}
			} else {
				width = visualViewport.width;
				height = visualViewport.height;
				if (layoutRelativeClientCoords) {
					x = visualViewport.offsetLeft;
					y = visualViewport.offsetTop;
				}
			}
		}
		if (getWindowScrollBarX(html) <= 0) {
			const doc = html.ownerDocument;
			const body = doc.body;
			const bodyStyles = getComputedStyle(body);
			const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
			const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
			const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
			if (gutter <= SCROLLBAR_MAX) width -= gutter;
		}
		return {
			width,
			height,
			x,
			y
		};
	}
	function getInnerBoundingClientRect(element, strategy) {
		const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
		const top = clientRect.top + element.clientTop;
		const left = clientRect.left + element.clientLeft;
		const scale = getScale(element);
		return {
			width: element.clientWidth * scale.x,
			height: element.clientHeight * scale.y,
			x: left * scale.x,
			y: top * scale.y
		};
	}
	function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
		let rect;
		if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") rect = getViewportRect(element, strategy, clippingAncestor);
		else if (clippingAncestor === "document") rect = getDocumentRect(getDocumentElement(element));
		else if (isElement(clippingAncestor)) rect = getInnerBoundingClientRect(clippingAncestor, strategy);
		else {
			const visualOffsets = getVisualOffsets(element);
			rect = {
				x: clippingAncestor.x - visualOffsets.x,
				y: clippingAncestor.y - visualOffsets.y,
				width: clippingAncestor.width,
				height: clippingAncestor.height
			};
		}
		return rectToClientRect(rect);
	}
	function getClippingElementAncestors(element, cache) {
		const cachedResult = cache.get(element);
		if (cachedResult) return cachedResult;
		let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
		let lastKeptComputedStyle = null;
		const elementIsFixed = getComputedStyle$1(element).position === "fixed";
		let currentNode = elementIsFixed ? getParentNode(element) : element;
		while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
			const computedStyle = getComputedStyle$1(currentNode);
			const currentNodeIsContaining = isContainingBlock(currentNode);
			const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
			if (!currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static")) result = result.filter((ancestor) => ancestor !== currentNode);
			else lastKeptComputedStyle = computedStyle;
			currentNode = getParentNode(currentNode);
		}
		cache.set(element, result);
		return result;
	}
	function getClippingRect(_ref) {
		let { element, boundary, rootBoundary, strategy } = _ref;
		const clippingAncestors = [...boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary), rootBoundary];
		const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
		let top = firstRect.top;
		let right = firstRect.right;
		let bottom = firstRect.bottom;
		let left = firstRect.left;
		for (let i = 1; i < clippingAncestors.length; i++) {
			const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
			top = max(rect.top, top);
			right = min(rect.right, right);
			bottom = min(rect.bottom, bottom);
			left = max(rect.left, left);
		}
		return {
			width: right - left,
			height: bottom - top,
			x: left,
			y: top
		};
	}
	function getDimensions(element) {
		const { width, height } = getCssDimensions(element);
		return {
			width,
			height
		};
	}
	function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
		const isOffsetParentAnElement = isHTMLElement(offsetParent);
		const documentElement = getDocumentElement(offsetParent);
		const isFixed = strategy === "fixed";
		const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
		let scroll = {
			scrollLeft: 0,
			scrollTop: 0
		};
		const offsets = createCoords(0);
		if (isOffsetParentAnElement || !isFixed) {
			if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) scroll = getNodeScroll(offsetParent);
			if (isOffsetParentAnElement) {
				const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
				offsets.x = offsetRect.x + offsetParent.clientLeft;
				offsets.y = offsetRect.y + offsetParent.clientTop;
			}
		}
		if (!isOffsetParentAnElement && documentElement) offsets.x = getWindowScrollBarX(documentElement);
		const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
		return {
			x: rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x,
			y: rect.top + scroll.scrollTop - offsets.y - htmlOffset.y,
			width: rect.width,
			height: rect.height
		};
	}
	function isStaticPositioned(element) {
		return getComputedStyle$1(element).position === "static";
	}
	function getTrueOffsetParent(element, polyfill) {
		if (!isHTMLElement(element) || getComputedStyle$1(element).position === "fixed") return null;
		if (polyfill) return polyfill(element);
		let rawOffsetParent = element.offsetParent;
		if (getDocumentElement(element) === rawOffsetParent) rawOffsetParent = rawOffsetParent.ownerDocument.body;
		return rawOffsetParent;
	}
	function getOffsetParent(element, polyfill) {
		const win = getWindow(element);
		if (isTopLayer(element)) return win;
		if (!isHTMLElement(element)) {
			let svgOffsetParent = getParentNode(element);
			while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
				if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) return svgOffsetParent;
				svgOffsetParent = getParentNode(svgOffsetParent);
			}
			return win;
		}
		let offsetParent = getTrueOffsetParent(element, polyfill);
		while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) offsetParent = getTrueOffsetParent(offsetParent, polyfill);
		if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) return win;
		return offsetParent || getContainingBlock(element) || win;
	}
	var getElementRects = async function(data) {
		const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
		const getDimensionsFn = this.getDimensions;
		const floatingDimensions = await getDimensionsFn(data.floating);
		return {
			reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
			floating: {
				x: 0,
				y: 0,
				width: floatingDimensions.width,
				height: floatingDimensions.height
			}
		};
	};
	function isRTL(element) {
		return getComputedStyle$1(element).direction === "rtl";
	}
	var platform = {
		convertOffsetParentRelativeRectToViewportRelativeRect,
		getDocumentElement,
		getClippingRect,
		getOffsetParent,
		getElementRects,
		getClientRects,
		getDimensions,
		getScale,
		isElement,
		isRTL
	};
	function rectsAreEqual(a, b) {
		return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
	}
	function observeMove(element, onMove, ancestorResize) {
		let io = null;
		let timeoutId;
		const root = getDocumentElement(element);
		function cleanup() {
			var _io;
			clearTimeout(timeoutId);
			(_io = io) == null || _io.disconnect();
			io = null;
		}
		function refresh(skip, threshold) {
			if (skip === void 0) skip = false;
			if (threshold === void 0) threshold = 1;
			cleanup();
			const elementRectForRootMargin = element.getBoundingClientRect();
			const { left, top, width, height } = elementRectForRootMargin;
			if (!skip) onMove();
			if (!width || !height) return;
			const insetTop = floor(top);
			const insetRight = floor(root.clientWidth - (left + width));
			const insetBottom = floor(root.clientHeight - (top + height));
			const insetLeft = floor(left);
			const options = {
				rootMargin: -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px",
				threshold: max(0, min(1, threshold)) || 1
			};
			let isFirstUpdate = true;
			function handleObserve(entries) {
				const ratio = entries[0].intersectionRatio;
				if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) return refresh();
				if (ratio !== threshold) {
					if (!isFirstUpdate) return refresh();
					if (!ratio) timeoutId = setTimeout(() => {
						refresh(false, 1e-7);
					}, 1e3);
					else refresh(false, ratio);
				}
				isFirstUpdate = false;
			}
			try {
				io = new IntersectionObserver(handleObserve, {
					...options,
					root: root.ownerDocument
				});
			} catch (_e) {
				io = new IntersectionObserver(handleObserve, options);
			}
			io.observe(element);
		}
		const win = getWindow(element);
		const handleResize = () => refresh(ancestorResize);
		win.addEventListener("resize", handleResize);
		refresh(true);
		return () => {
			win.removeEventListener("resize", handleResize);
			cleanup();
		};
	}
	/**
	* Automatically updates the position of the floating element when necessary.
	* Should only be called when the floating element is mounted on the DOM or
	* visible on the screen.
	* @returns cleanup function that should be invoked when the floating element is
	* removed from the DOM or hidden from the screen.
	* @see https://floating-ui.com/docs/autoUpdate
	*/
	function autoUpdate(reference, floating, update, options) {
		if (options === void 0) options = {};
		const { ancestorScroll = true, ancestorResize = true, elementResize = typeof ResizeObserver === "function", layoutShift = typeof IntersectionObserver === "function", animationFrame = false } = options;
		const referenceEl = unwrapElement(reference);
		const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
		ancestors.forEach((ancestor) => {
			ancestorScroll && ancestor.addEventListener("scroll", update);
			ancestorResize && ancestor.addEventListener("resize", update);
		});
		const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update, ancestorResize) : null;
		let reobserveFrame = -1;
		let resizeObserver = null;
		if (elementResize) {
			resizeObserver = new ResizeObserver((_ref) => {
				let [firstEntry] = _ref;
				if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
					resizeObserver.unobserve(floating);
					cancelAnimationFrame(reobserveFrame);
					reobserveFrame = requestAnimationFrame(() => {
						var _resizeObserver;
						(_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
					});
				}
				update();
			});
			if (referenceEl && !animationFrame) resizeObserver.observe(referenceEl);
			if (floating) resizeObserver.observe(floating);
		}
		let frameId;
		let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
		if (animationFrame) frameLoop();
		function frameLoop() {
			const nextRefRect = getBoundingClientRect(reference);
			if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) update();
			prevRefRect = nextRefRect;
			frameId = requestAnimationFrame(frameLoop);
		}
		update();
		return () => {
			var _resizeObserver2;
			ancestors.forEach((ancestor) => {
				ancestorScroll && ancestor.removeEventListener("scroll", update);
				ancestorResize && ancestor.removeEventListener("resize", update);
			});
			cleanupIo?.();
			(_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
			resizeObserver = null;
			if (animationFrame) cancelAnimationFrame(frameId);
		};
	}
	/**
	* Modifies the placement by translating the floating element along the
	* specified axes.
	* A number (shorthand for `mainAxis` or distance), or an axes configuration
	* object may be passed.
	* @see https://floating-ui.com/docs/offset
	*/
	var offset = offset$1;
	/**
	* Optimizes the visibility of the floating element by shifting it in order to
	* keep it in view when it will overflow the clipping boundary.
	* @see https://floating-ui.com/docs/shift
	*/
	var shift = shift$1;
	/**
	* Optimizes the visibility of the floating element by flipping the `placement`
	* in order to keep it in view when the preferred placement(s) will overflow the
	* clipping boundary. Alternative to `autoPlacement`.
	* @see https://floating-ui.com/docs/flip
	*/
	var flip = flip$1;
	/**
	* Provides data that allows you to change the size of the floating element —
	* for instance, prevent it from overflowing the clipping boundary or match the
	* width of the reference element.
	* @see https://floating-ui.com/docs/size
	*/
	var size = size$1;
	/**
	* Provides data to hide the floating element in applicable situations, such as
	* when it is not in the same clipping context as the reference element.
	* @see https://floating-ui.com/docs/hide
	*/
	var hide = hide$1;
	/**
	* Provides data to position an inner element of the floating element so that it
	* appears centered to the reference element.
	* @see https://floating-ui.com/docs/arrow
	*/
	var arrow = arrow$1;
	/**
	* Built-in `limiter` that will stop `shift()` at a certain point.
	*/
	var limitShift = limitShift$1;
	/**
	* Computes the `x` and `y` coordinates that will place the floating element
	* next to a given reference element.
	*/
	var computePosition = (reference, floating, options) => {
		const cache = /* @__PURE__ */ new Map();
		const mergedOptions = options != null ? options : {};
		const platformWithCache = {
			...platform,
			...mergedOptions.platform,
			_c: cache
		};
		return computePosition$1(reference, floating, {
			...mergedOptions,
			platform: platformWithCache
		});
	};
	//#endregion
	//#region node_modules/bits-ui/dist/internal/floating-svelte/floating-utils.svelte.js
	function get(valueOrGetValue) {
		return typeof valueOrGetValue === "function" ? valueOrGetValue() : valueOrGetValue;
	}
	function getDPR(element) {
		if (typeof window === "undefined") return 1;
		return (element.ownerDocument.defaultView || window).devicePixelRatio || 1;
	}
	function roundByDPR(element, value) {
		const dpr = getDPR(element);
		return Math.round(value * dpr) / dpr;
	}
	function getFloatingContentCSSVars(name) {
		return {
			[`--bits-${name}-content-transform-origin`]: `var(--bits-floating-transform-origin)`,
			[`--bits-${name}-content-available-width`]: `var(--bits-floating-available-width)`,
			[`--bits-${name}-content-available-height`]: `var(--bits-floating-available-height)`,
			[`--bits-${name}-anchor-width`]: `var(--bits-floating-anchor-width)`,
			[`--bits-${name}-anchor-height`]: `var(--bits-floating-anchor-height)`
		};
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/floating-svelte/use-floating.svelte.js
	function useFloating(options) {
		/** Options */
		const whileElementsMountedOption = options.whileElementsMounted;
		const openOption = /* @__PURE__ */ user_derived(() => get(options.open) ?? true);
		const middlewareOption = /* @__PURE__ */ user_derived(() => get(options.middleware));
		const transformOption = /* @__PURE__ */ user_derived(() => get(options.transform) ?? true);
		const placementOption = /* @__PURE__ */ user_derived(() => get(options.placement) ?? "bottom");
		const strategyOption = /* @__PURE__ */ user_derived(() => get(options.strategy) ?? "absolute");
		const sideOffsetOption = /* @__PURE__ */ user_derived(() => get(options.sideOffset) ?? 0);
		const alignOffsetOption = /* @__PURE__ */ user_derived(() => get(options.alignOffset) ?? 0);
		const reference = options.reference;
		/** State */
		let x = /* @__PURE__ */ state(0);
		let y = /* @__PURE__ */ state(0);
		const floating = simpleBox(null);
		let strategy = /* @__PURE__ */ state(proxy(get$2(strategyOption)));
		let placement = /* @__PURE__ */ state(proxy(get$2(placementOption)));
		let middlewareData = /* @__PURE__ */ state(proxy({}));
		let isPositioned = /* @__PURE__ */ state(false);
		let hasWhileMountedPosition = false;
		let updateRequestId = 0;
		const floatingStyles = /* @__PURE__ */ user_derived(() => {
			const xVal = floating.current ? roundByDPR(floating.current, get$2(x)) : get$2(x);
			const yVal = floating.current ? roundByDPR(floating.current, get$2(y)) : get$2(y);
			if (get$2(transformOption)) return {
				position: get$2(strategy),
				left: "0",
				top: "0",
				transform: `translate(${xVal}px, ${yVal}px)`,
				...floating.current && getDPR(floating.current) >= 1.5 && { willChange: "transform" }
			};
			return {
				position: get$2(strategy),
				left: `${xVal}px`,
				top: `${yVal}px`
			};
		});
		/** Effects */
		let whileElementsMountedCleanup;
		function update() {
			if (reference.current === null || floating.current === null) return;
			const referenceNode = reference.current;
			const floatingNode = floating.current;
			const requestId = ++updateRequestId;
			computePosition(referenceNode, floatingNode, {
				middleware: get$2(middlewareOption),
				placement: get$2(placementOption),
				strategy: get$2(strategyOption)
			}).then((position) => {
				if (requestId !== updateRequestId) return;
				if (reference.current !== referenceNode || floating.current !== floatingNode) return;
				if (isReferenceHidden(referenceNode)) {
					set(middlewareData, {
						...get$2(middlewareData),
						hide: {
							...get$2(middlewareData).hide,
							referenceHidden: true
						}
					}, true);
					return;
				}
				if (!get$2(openOption) && get$2(x) !== 0 && get$2(y) !== 0) {
					const maxExpectedOffset = Math.max(Math.abs(get$2(sideOffsetOption)), Math.abs(get$2(alignOffsetOption)), 15);
					if (position.x <= maxExpectedOffset && position.y <= maxExpectedOffset) return;
				}
				set(x, position.x, true);
				set(y, position.y, true);
				set(strategy, position.strategy, true);
				set(placement, position.placement, true);
				set(middlewareData, position.middlewareData, true);
				set(isPositioned, true);
			});
		}
		function cleanup() {
			if (typeof whileElementsMountedCleanup === "function") {
				whileElementsMountedCleanup();
				whileElementsMountedCleanup = void 0;
			}
			updateRequestId++;
		}
		function attach() {
			cleanup();
			if (whileElementsMountedOption === void 0) {
				update();
				return;
			}
			if (!get$2(openOption)) return;
			if (reference.current === null || floating.current === null) return;
			whileElementsMountedCleanup = whileElementsMountedOption(reference.current, floating.current, update);
		}
		function reset() {
			if (!get$2(openOption) && floating.current === null) set(isPositioned, false);
		}
		function trackWhileMountedDeps() {
			return [
				get$2(middlewareOption),
				get$2(placementOption),
				get$2(strategyOption),
				get$2(sideOffsetOption),
				get$2(alignOffsetOption),
				get$2(openOption)
			];
		}
		user_effect(() => {
			if (whileElementsMountedOption !== void 0) return;
			if (!get$2(openOption)) return;
			update();
		});
		user_effect(attach);
		user_effect(() => {
			if (whileElementsMountedOption === void 0) return;
			trackWhileMountedDeps();
			if (!get$2(openOption)) {
				hasWhileMountedPosition = false;
				return;
			}
			if (!get$2(isPositioned)) {
				hasWhileMountedPosition = false;
				return;
			}
			if (!hasWhileMountedPosition) {
				hasWhileMountedPosition = true;
				return;
			}
			update();
		});
		user_effect(reset);
		user_effect(() => cleanup);
		return {
			floating,
			reference,
			get strategy() {
				return get$2(strategy);
			},
			get placement() {
				return get$2(placement);
			},
			get middlewareData() {
				return get$2(middlewareData);
			},
			get isPositioned() {
				return get$2(isPositioned);
			},
			get floatingStyles() {
				return get$2(floatingStyles);
			},
			get update() {
				return update;
			}
		};
	}
	function isReferenceHidden(node) {
		if (!(node instanceof Element)) return false;
		if (!node.isConnected) return true;
		if (node instanceof HTMLElement && node.hidden) return true;
		return node.getClientRects().length === 0;
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/floating-layer/use-floating-layer.svelte.js
	var OPPOSITE_SIDE = {
		top: "bottom",
		right: "left",
		bottom: "top",
		left: "right"
	};
	var FloatingRootContext = new Context("Floating.Root");
	var FloatingContentContext = new Context("Floating.Content");
	var FloatingTooltipRootContext = new Context("Floating.Root");
	var FloatingRootState = class FloatingRootState {
		static create(tooltip = false) {
			return tooltip ? FloatingTooltipRootContext.set(new FloatingRootState()) : FloatingRootContext.set(new FloatingRootState());
		}
		anchorNode = simpleBox(null);
		customAnchorNode = simpleBox(null);
		triggerNode = simpleBox(null);
		constructor() {
			user_effect(() => {
				if (this.customAnchorNode.current) {
					if (typeof this.customAnchorNode.current === "string") this.anchorNode.current = document.querySelector(this.customAnchorNode.current);
					else this.anchorNode.current = this.customAnchorNode.current;
				} else this.anchorNode.current = this.triggerNode.current;
			});
		}
	};
	var FloatingContentState = class FloatingContentState {
		static create(opts, tooltip = false) {
			return tooltip ? FloatingContentContext.set(new FloatingContentState(opts, FloatingTooltipRootContext.get())) : FloatingContentContext.set(new FloatingContentState(opts, FloatingRootContext.get()));
		}
		opts;
		root;
		contentRef = simpleBox(null);
		wrapperRef = simpleBox(null);
		arrowRef = simpleBox(null);
		contentAttachment = attachRef(this.contentRef);
		wrapperAttachment = attachRef(this.wrapperRef);
		arrowAttachment = attachRef(this.arrowRef);
		arrowId = simpleBox(useId());
		#transformedStyle = /* @__PURE__ */ user_derived(() => {
			if (typeof this.opts.style === "string") return cssToStyleObj(this.opts.style);
			if (!this.opts.style) return {};
		});
		#updatePositionStrategy = void 0;
		#arrowSize = new ElementSize(() => this.arrowRef.current ?? void 0);
		#arrowWidth = /* @__PURE__ */ user_derived(() => this.#arrowSize?.width ?? 0);
		#arrowHeight = /* @__PURE__ */ user_derived(() => this.#arrowSize?.height ?? 0);
		#desiredPlacement = /* @__PURE__ */ user_derived(() => this.opts.side?.current + (this.opts.align.current !== "center" ? `-${this.opts.align.current}` : ""));
		#boundary = /* @__PURE__ */ user_derived(() => Array.isArray(this.opts.collisionBoundary.current) ? this.opts.collisionBoundary.current : [this.opts.collisionBoundary.current]);
		#hasExplicitBoundaries = /* @__PURE__ */ user_derived(() => get$2(this.#boundary).length > 0);
		get hasExplicitBoundaries() {
			return get$2(this.#hasExplicitBoundaries);
		}
		set hasExplicitBoundaries(value) {
			set(this.#hasExplicitBoundaries, value);
		}
		#detectOverflowOptions = /* @__PURE__ */ user_derived(() => ({
			padding: this.opts.collisionPadding.current,
			boundary: get$2(this.#boundary).filter(isNotNull),
			altBoundary: this.hasExplicitBoundaries
		}));
		get detectOverflowOptions() {
			return get$2(this.#detectOverflowOptions);
		}
		set detectOverflowOptions(value) {
			set(this.#detectOverflowOptions, value);
		}
		#availableWidth = /* @__PURE__ */ state(void 0);
		#availableHeight = /* @__PURE__ */ state(void 0);
		#anchorWidth = /* @__PURE__ */ state(void 0);
		#anchorHeight = /* @__PURE__ */ state(void 0);
		#middleware = /* @__PURE__ */ user_derived(() => [
			offset({
				mainAxis: this.opts.sideOffset.current + get$2(this.#arrowHeight),
				alignmentAxis: this.opts.alignOffset.current
			}),
			this.opts.avoidCollisions.current && shift({
				mainAxis: true,
				crossAxis: false,
				limiter: this.opts.sticky.current === "partial" ? limitShift() : void 0,
				...this.detectOverflowOptions
			}),
			this.opts.avoidCollisions.current && flip({ ...this.detectOverflowOptions }),
			size({
				...this.detectOverflowOptions,
				apply: ({ rects, availableWidth, availableHeight }) => {
					const { width: anchorWidth, height: anchorHeight } = rects.reference;
					set(this.#availableWidth, availableWidth, true);
					set(this.#availableHeight, availableHeight, true);
					set(this.#anchorWidth, anchorWidth, true);
					set(this.#anchorHeight, anchorHeight, true);
				}
			}),
			this.arrowRef.current && arrow({
				element: this.arrowRef.current,
				padding: this.opts.arrowPadding.current
			}),
			transformOrigin({
				arrowWidth: get$2(this.#arrowWidth),
				arrowHeight: get$2(this.#arrowHeight)
			}),
			this.opts.hideWhenDetached.current && hide({
				strategy: "referenceHidden",
				...this.detectOverflowOptions
			})
		].filter(Boolean));
		get middleware() {
			return get$2(this.#middleware);
		}
		set middleware(value) {
			set(this.#middleware, value);
		}
		floating;
		#placedSide = /* @__PURE__ */ user_derived(() => getSideFromPlacement(this.floating.placement));
		get placedSide() {
			return get$2(this.#placedSide);
		}
		set placedSide(value) {
			set(this.#placedSide, value);
		}
		#placedAlign = /* @__PURE__ */ user_derived(() => getAlignFromPlacement(this.floating.placement));
		get placedAlign() {
			return get$2(this.#placedAlign);
		}
		set placedAlign(value) {
			set(this.#placedAlign, value);
		}
		#arrowX = /* @__PURE__ */ user_derived(() => this.floating.middlewareData.arrow?.x ?? 0);
		get arrowX() {
			return get$2(this.#arrowX);
		}
		set arrowX(value) {
			set(this.#arrowX, value);
		}
		#arrowY = /* @__PURE__ */ user_derived(() => this.floating.middlewareData.arrow?.y ?? 0);
		get arrowY() {
			return get$2(this.#arrowY);
		}
		set arrowY(value) {
			set(this.#arrowY, value);
		}
		#cannotCenterArrow = /* @__PURE__ */ user_derived(() => this.floating.middlewareData.arrow?.centerOffset !== 0);
		get cannotCenterArrow() {
			return get$2(this.#cannotCenterArrow);
		}
		set cannotCenterArrow(value) {
			set(this.#cannotCenterArrow, value);
		}
		#contentZIndex = /* @__PURE__ */ state();
		get contentZIndex() {
			return get$2(this.#contentZIndex);
		}
		set contentZIndex(value) {
			set(this.#contentZIndex, value, true);
		}
		#arrowBaseSide = /* @__PURE__ */ user_derived(() => OPPOSITE_SIDE[this.placedSide]);
		get arrowBaseSide() {
			return get$2(this.#arrowBaseSide);
		}
		set arrowBaseSide(value) {
			set(this.#arrowBaseSide, value);
		}
		#wrapperProps = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.wrapperId.current,
			"data-bits-floating-content-wrapper": "",
			style: {
				...this.floating.floatingStyles,
				transform: this.floating.isPositioned ? this.floating.floatingStyles.transform : "translate(0, -200%)",
				minWidth: "max-content",
				zIndex: this.contentZIndex,
				"--bits-floating-transform-origin": `${this.floating.middlewareData.transformOrigin?.x} ${this.floating.middlewareData.transformOrigin?.y}`,
				"--bits-floating-available-width": `${get$2(this.#availableWidth)}px`,
				"--bits-floating-available-height": `${get$2(this.#availableHeight)}px`,
				"--bits-floating-anchor-width": `${get$2(this.#anchorWidth)}px`,
				"--bits-floating-anchor-height": `${get$2(this.#anchorHeight)}px`,
				...this.floating.middlewareData.hide?.referenceHidden && {
					visibility: "hidden",
					"pointer-events": "none"
				},
				...get$2(this.#transformedStyle)
			},
			dir: this.opts.dir.current,
			...this.wrapperAttachment
		}));
		get wrapperProps() {
			return get$2(this.#wrapperProps);
		}
		set wrapperProps(value) {
			set(this.#wrapperProps, value);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			"data-side": this.placedSide,
			"data-align": this.placedAlign,
			style: styleToString({ ...get$2(this.#transformedStyle) }),
			...this.contentAttachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
		#arrowStyle = /* @__PURE__ */ user_derived(() => ({
			position: "absolute",
			left: this.arrowX ? `${this.arrowX}px` : void 0,
			top: this.arrowY ? `${this.arrowY}px` : void 0,
			[this.arrowBaseSide]: 0,
			"transform-origin": {
				top: "",
				right: "0 0",
				bottom: "center 0",
				left: "100% 0"
			}[this.placedSide],
			transform: {
				top: "translateY(100%)",
				right: "translateY(50%) rotate(90deg) translateX(-50%)",
				bottom: "rotate(180deg)",
				left: "translateY(50%) rotate(-90deg) translateX(50%)"
			}[this.placedSide],
			visibility: this.cannotCenterArrow ? "hidden" : void 0
		}));
		get arrowStyle() {
			return get$2(this.#arrowStyle);
		}
		set arrowStyle(value) {
			set(this.#arrowStyle, value);
		}
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.#updatePositionStrategy = opts.updatePositionStrategy;
			if (opts.customAnchor) this.root.customAnchorNode.current = opts.customAnchor.current;
			watch(() => opts.customAnchor.current, (customAnchor) => {
				this.root.customAnchorNode.current = customAnchor;
			});
			this.floating = useFloating({
				strategy: () => this.opts.strategy.current,
				placement: () => get$2(this.#desiredPlacement),
				middleware: () => this.middleware,
				reference: this.root.anchorNode,
				whileElementsMounted: (...args) => {
					return autoUpdate(...args, { animationFrame: this.#updatePositionStrategy?.current === "always" });
				},
				open: () => this.opts.enabled.current,
				sideOffset: () => this.opts.sideOffset.current,
				alignOffset: () => this.opts.alignOffset.current
			});
			user_effect(() => {
				if (!this.floating.isPositioned) return;
				this.opts.onPlaced?.current();
			});
			watch(() => this.contentRef.current, (contentNode) => {
				if (!contentNode || !this.opts.enabled.current) return;
				const win = getWindow$1(contentNode);
				const rafId = win.requestAnimationFrame(() => {
					if (this.contentRef.current !== contentNode || !this.opts.enabled.current) return;
					const zIndex = win.getComputedStyle(contentNode).zIndex;
					if (zIndex !== this.contentZIndex) this.contentZIndex = zIndex;
				});
				return () => {
					win.cancelAnimationFrame(rafId);
				};
			});
			user_effect(() => {
				this.floating.floating.current = this.wrapperRef.current;
			});
		}
	};
	var FloatingAnchorState = class FloatingAnchorState {
		static create(opts, tooltip = false) {
			return tooltip ? new FloatingAnchorState(opts, FloatingTooltipRootContext.get()) : new FloatingAnchorState(opts, FloatingRootContext.get());
		}
		opts;
		root;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			if (opts.virtualEl && opts.virtualEl.current) root.triggerNode = boxFrom(opts.virtualEl.current);
			else root.triggerNode = opts.ref;
		}
	};
	function transformOrigin(options) {
		return {
			name: "transformOrigin",
			options,
			fn(data) {
				const { placement, rects, middlewareData } = data;
				const isArrowHidden = middlewareData.arrow?.centerOffset !== 0;
				const arrowWidth = isArrowHidden ? 0 : options.arrowWidth;
				const arrowHeight = isArrowHidden ? 0 : options.arrowHeight;
				const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
				const noArrowAlign = {
					start: "0%",
					center: "50%",
					end: "100%"
				}[placedAlign];
				const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
				const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
				let x = "";
				let y = "";
				if (placedSide === "bottom") {
					x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
					y = `${-arrowHeight}px`;
				} else if (placedSide === "top") {
					x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
					y = `${rects.floating.height + arrowHeight}px`;
				} else if (placedSide === "right") {
					x = `${-arrowHeight}px`;
					y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
				} else if (placedSide === "left") {
					x = `${rects.floating.width + arrowHeight}px`;
					y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
				}
				return { data: {
					x,
					y
				} };
			}
		};
	}
	function getSideAndAlignFromPlacement(placement) {
		const [side, align = "center"] = placement.split("-");
		return [side, align];
	}
	function getSideFromPlacement(placement) {
		return getSideAndAlignFromPlacement(placement)[0];
	}
	function getAlignFromPlacement(placement) {
		return getSideAndAlignFromPlacement(placement)[1];
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer.svelte
	function Floating_layer($$anchor, $$props) {
		push($$props, true);
		let tooltip = prop($$props, "tooltip", 3, false);
		FloatingRootState.create(tooltip());
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.children ?? noop$1);
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/data-typeahead.svelte.js
	var DataTypeahead = class {
		#opts;
		#candidateValues = /* @__PURE__ */ user_derived(() => this.#opts.candidateValues());
		#search;
		constructor(opts) {
			this.#opts = opts;
			this.#search = boxAutoReset("", {
				afterMs: 1e3,
				getWindow: this.#opts.getWindow
			});
			this.handleTypeaheadSearch = this.handleTypeaheadSearch.bind(this);
			this.resetTypeahead = this.resetTypeahead.bind(this);
		}
		handleTypeaheadSearch(key) {
			if (!this.#opts.enabled() || !get$2(this.#candidateValues).length) return;
			this.#search.current = this.#search.current + key;
			const currentItem = this.#opts.getCurrentItem();
			const currentMatch = get$2(this.#candidateValues).find((item) => item === currentItem) ?? "";
			const nextMatch = getNextMatch(get$2(this.#candidateValues).map((item) => item ?? ""), this.#search.current, currentMatch);
			const newItem = get$2(this.#candidateValues).find((item) => item === nextMatch);
			if (newItem) this.#opts.onMatch(newItem);
			return newItem;
		}
		resetTypeahead() {
			this.#search.current = "";
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/select.svelte.js
	var INTERACTION_KEYS = [
		ARROW_LEFT,
		ESCAPE,
		ARROW_RIGHT,
		SHIFT,
		CAPS_LOCK,
		CONTROL,
		"Alt",
		META,
		ENTER,
		"F1",
		"F2",
		"F3",
		"F4",
		"F5",
		"F6",
		"F7",
		"F8",
		"F9",
		"F10",
		"F11",
		"F12"
	];
	var FIRST_KEYS = [
		ARROW_DOWN,
		PAGE_UP,
		HOME
	];
	var LAST_KEYS = [
		ARROW_UP,
		PAGE_DOWN,
		"End"
	];
	var FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
	var selectAttrs = createBitsAttrs({
		component: "select",
		parts: [
			"trigger",
			"content",
			"item",
			"viewport",
			"scroll-up-button",
			"scroll-down-button",
			"group",
			"group-label",
			"separator",
			"arrow",
			"input",
			"content-wrapper",
			"item-text",
			"value"
		]
	});
	var SelectRootContext = new Context("Select.Root | Combobox.Root");
	new Context("Select.Group | Combobox.Group");
	var SelectContentContext = new Context("Select.Content | Combobox.Content");
	var SelectBaseRootState = class {
		opts;
		#touchedInput = /* @__PURE__ */ state(false);
		get touchedInput() {
			return get$2(this.#touchedInput);
		}
		set touchedInput(value) {
			set(this.#touchedInput, value, true);
		}
		#inputNode = /* @__PURE__ */ state(null);
		get inputNode() {
			return get$2(this.#inputNode);
		}
		set inputNode(value) {
			set(this.#inputNode, value, true);
		}
		#contentNode = /* @__PURE__ */ state(null);
		get contentNode() {
			return get$2(this.#contentNode);
		}
		set contentNode(value) {
			set(this.#contentNode, value, true);
		}
		contentPresence;
		#viewportNode = /* @__PURE__ */ state(null);
		get viewportNode() {
			return get$2(this.#viewportNode);
		}
		set viewportNode(value) {
			set(this.#viewportNode, value, true);
		}
		#triggerNode = /* @__PURE__ */ state(null);
		get triggerNode() {
			return get$2(this.#triggerNode);
		}
		set triggerNode(value) {
			set(this.#triggerNode, value, true);
		}
		#valueNode = /* @__PURE__ */ state(null);
		get valueNode() {
			return get$2(this.#valueNode);
		}
		set valueNode(value) {
			set(this.#valueNode, value, true);
		}
		#valueId = /* @__PURE__ */ state("");
		get valueId() {
			return get$2(this.#valueId);
		}
		set valueId(value) {
			set(this.#valueId, value, true);
		}
		#highlightedNode = /* @__PURE__ */ state(null);
		get highlightedNode() {
			return get$2(this.#highlightedNode);
		}
		set highlightedNode(value) {
			set(this.#highlightedNode, value, true);
		}
		#highlightedValue = /* @__PURE__ */ user_derived(() => {
			if (!this.highlightedNode) return null;
			return this.highlightedNode.getAttribute("data-value");
		});
		get highlightedValue() {
			return get$2(this.#highlightedValue);
		}
		set highlightedValue(value) {
			set(this.#highlightedValue, value);
		}
		#highlightedId = /* @__PURE__ */ user_derived(() => {
			if (!this.highlightedNode) return void 0;
			return this.highlightedNode.id;
		});
		get highlightedId() {
			return get$2(this.#highlightedId);
		}
		set highlightedId(value) {
			set(this.#highlightedId, value);
		}
		#highlightedLabel = /* @__PURE__ */ user_derived(() => {
			if (!this.highlightedNode) return null;
			return this.highlightedNode.getAttribute("data-label");
		});
		get highlightedLabel() {
			return get$2(this.#highlightedLabel);
		}
		set highlightedLabel(value) {
			set(this.#highlightedLabel, value);
		}
		#contentIsPositioned = /* @__PURE__ */ state(false);
		get contentIsPositioned() {
			return get$2(this.#contentIsPositioned);
		}
		set contentIsPositioned(value) {
			set(this.#contentIsPositioned, value, true);
		}
		isUsingKeyboard = false;
		isCombobox = false;
		domContext = new DOMContext(() => null);
		constructor(opts) {
			this.opts = opts;
			this.isCombobox = opts.isCombobox;
			this.contentPresence = new PresenceManager({
				ref: boxWith(() => this.contentNode),
				open: this.opts.open,
				onComplete: () => {
					this.opts.onOpenChangeComplete.current(this.opts.open.current);
				}
			});
			user_pre_effect(() => {
				if (!this.opts.open.current) this.setHighlightedNode(null);
			});
		}
		setHighlightedNode(node, initial = false) {
			this.highlightedNode = node;
			if (node && (this.isUsingKeyboard || initial)) this.scrollHighlightedNodeIntoView(node);
		}
		scrollHighlightedNodeIntoView(node) {
			if (!this.viewportNode || !this.contentIsPositioned) return;
			node.scrollIntoView({ block: this.opts.scrollAlignment.current });
		}
		getCandidateNodes() {
			const node = this.contentNode;
			if (!node) return [];
			return Array.from(node.querySelectorAll(`[${this.getBitsAttr("item")}]:not([data-disabled])`));
		}
		setHighlightedToFirstCandidate(initial = false) {
			this.setHighlightedNode(null);
			let nodes = this.getCandidateNodes();
			if (!nodes.length) return;
			if (this.viewportNode) {
				const viewportRect = this.viewportNode.getBoundingClientRect();
				nodes = nodes.filter((node) => {
					if (!this.viewportNode) return false;
					const nodeRect = node.getBoundingClientRect();
					return nodeRect.right <= viewportRect.right && nodeRect.left >= viewportRect.left && nodeRect.bottom <= viewportRect.bottom && nodeRect.top >= viewportRect.top;
				});
			}
			this.setHighlightedNode(nodes[0], initial);
		}
		getNodeByValue(value) {
			return this.getCandidateNodes().find((node) => node.dataset.value === value) ?? null;
		}
		/**
		* Resolves the display label for a value: `items` entry when present, otherwise the
		* mounted item's `data-label` or its text content.
		*/
		getLabelForValue(value) {
			if (value === "") return "";
			const fromItems = this.opts.items.current.find((item) => item.value === value)?.label;
			if (fromItems !== void 0) return fromItems;
			const node = this.getNodeByValue(value);
			if (node) {
				const dataLabel = node.getAttribute("data-label");
				if (dataLabel !== null && dataLabel !== "") return dataLabel;
				return node.textContent?.trim() ?? value;
			}
			return value;
		}
		setOpen(open) {
			this.opts.open.current = open;
		}
		toggleOpen() {
			this.opts.open.current = !this.opts.open.current;
		}
		handleOpen() {
			this.setOpen(true);
		}
		handleClose() {
			this.setHighlightedNode(null);
			this.setOpen(false);
		}
		toggleMenu() {
			this.toggleOpen();
		}
		getBitsAttr = (part) => {
			return selectAttrs.getAttr(part, this.isCombobox ? "combobox" : void 0);
		};
	};
	var SelectSingleRootState = class extends SelectBaseRootState {
		opts;
		isMulti = false;
		#hasValue = /* @__PURE__ */ user_derived(() => this.opts.value.current !== "");
		get hasValue() {
			return get$2(this.#hasValue);
		}
		set hasValue(value) {
			set(this.#hasValue, value);
		}
		#currentLabel = /* @__PURE__ */ user_derived(() => {
			if (!this.opts.items.current.length) return "";
			return this.opts.items.current.find((item) => item.value === this.opts.value.current)?.label ?? "";
		});
		get currentLabel() {
			return get$2(this.#currentLabel);
		}
		set currentLabel(value) {
			set(this.#currentLabel, value);
		}
		#candidateLabels = /* @__PURE__ */ user_derived(() => {
			if (!this.opts.items.current.length) return [];
			return this.opts.items.current.filter((item) => !item.disabled).map((item) => item.label);
		});
		get candidateLabels() {
			return get$2(this.#candidateLabels);
		}
		set candidateLabels(value) {
			set(this.#candidateLabels, value);
		}
		#dataTypeaheadEnabled = /* @__PURE__ */ user_derived(() => {
			if (this.isMulti) return false;
			if (this.opts.items.current.length === 0) return false;
			return true;
		});
		get dataTypeaheadEnabled() {
			return get$2(this.#dataTypeaheadEnabled);
		}
		set dataTypeaheadEnabled(value) {
			set(this.#dataTypeaheadEnabled, value);
		}
		constructor(opts) {
			super(opts);
			this.opts = opts;
			user_effect(() => {
				if (!this.opts.open.current && this.highlightedNode) this.setHighlightedNode(null);
			});
			watch(() => this.opts.open.current, () => {
				if (!this.opts.open.current) return;
				this.setInitialHighlightedNode();
			});
		}
		includesItem(itemValue) {
			return this.opts.value.current === itemValue;
		}
		toggleItem(itemValue, itemLabel = itemValue) {
			const newValue = this.includesItem(itemValue) ? "" : itemValue;
			this.opts.value.current = newValue;
			if (newValue !== "") this.opts.inputValue.current = itemLabel;
		}
		setInitialHighlightedNode() {
			afterTick(() => {
				if (this.highlightedNode && this.domContext.getDocument().contains(this.highlightedNode)) return;
				if (this.opts.value.current !== "") {
					const node = this.getNodeByValue(this.opts.value.current);
					if (node) {
						this.setHighlightedNode(node, true);
						return;
					}
				}
				this.setHighlightedToFirstCandidate(true);
			});
		}
	};
	var SelectMultipleRootState = class extends SelectBaseRootState {
		opts;
		isMulti = true;
		#hasValue = /* @__PURE__ */ user_derived(() => this.opts.value.current.length > 0);
		get hasValue() {
			return get$2(this.#hasValue);
		}
		set hasValue(value) {
			set(this.#hasValue, value);
		}
		constructor(opts) {
			super(opts);
			this.opts = opts;
			user_effect(() => {
				if (!this.opts.open.current && this.highlightedNode) this.setHighlightedNode(null);
			});
			watch(() => this.opts.open.current, () => {
				if (!this.opts.open.current) return;
				this.setInitialHighlightedNode();
			});
		}
		includesItem(itemValue) {
			return this.opts.value.current.includes(itemValue);
		}
		toggleItem(itemValue, itemLabel = itemValue) {
			if (this.includesItem(itemValue)) this.opts.value.current = this.opts.value.current.filter((v) => v !== itemValue);
			else this.opts.value.current = [...this.opts.value.current, itemValue];
			this.opts.inputValue.current = itemLabel;
		}
		setInitialHighlightedNode() {
			afterTick(() => {
				if (!this.domContext) return;
				if (this.highlightedNode && this.domContext.getDocument().contains(this.highlightedNode)) return;
				if (this.opts.value.current.length && this.opts.value.current[0] !== "") {
					const node = this.getNodeByValue(this.opts.value.current[0]);
					if (node) {
						this.setHighlightedNode(node, true);
						return;
					}
				}
				this.setHighlightedToFirstCandidate(true);
			});
		}
	};
	var SelectRootState = class {
		static create(props) {
			const { type, ...rest } = props;
			const rootState = type === "single" ? new SelectSingleRootState(rest) : new SelectMultipleRootState(rest);
			return SelectRootContext.set(rootState);
		}
	};
	var SelectValueState = class SelectValueState {
		static create(opts) {
			return new SelectValueState(opts, SelectRootContext.get());
		}
		root;
		opts;
		attachment;
		constructor(opts, root) {
			this.root = root;
			this.opts = opts;
			this.attachment = attachRef(opts.ref, (v) => this.root.valueNode = v);
			this.setValue = this.setValue.bind(this);
		}
		setValue(value) {
			if (this.root.isMulti && !Array.isArray(value)) return;
			if (!this.root.isMulti && typeof value !== "string") return;
			this.root.opts.value.current = value;
		}
		#snippetProps = /* @__PURE__ */ user_derived(() => {
			if (this.root.isMulti) return {
				selection: {
					type: "multiple",
					selected: this.root.opts.value.current.length > 0 ? this.root.opts.value.current.map((value) => ({
						value,
						label: this.root.getLabelForValue(value)
					})) : [],
					setValue: this.setValue
				},
				placeholder: this.opts.placeholder.current ?? null,
				disabled: this.root.opts.disabled.current
			};
			const value = this.root.opts.value.current;
			return {
				selection: {
					type: "single",
					selected: value !== "" ? {
						value,
						label: value === "" ? "" : this.root.getLabelForValue(value)
					} : void 0,
					setValue: this.setValue
				},
				placeholder: this.opts.placeholder.current ?? null,
				disabled: this.root.opts.disabled.current
			};
		});
		get snippetProps() {
			return get$2(this.#snippetProps);
		}
		set snippetProps(value) {
			set(this.#snippetProps, value);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			"data-placeholder": this.root.hasValue ? void 0 : "",
			"data-select-value": "",
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var SelectInputState = class SelectInputState {
		static create(opts) {
			return new SelectInputState(opts, SelectRootContext.get());
		}
		opts;
		root;
		attachment;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref, (v) => this.root.inputNode = v);
			this.root.domContext = new DOMContext(opts.ref);
			this.onkeydown = this.onkeydown.bind(this);
			this.oninput = this.oninput.bind(this);
			watch([() => this.root.opts.value.current, () => this.opts.clearOnDeselect.current], ([value, clearOnDeselect], [prevValue]) => {
				if (!clearOnDeselect) return;
				if (Array.isArray(value) && Array.isArray(prevValue)) {
					if (value.length === 0 && prevValue.length !== 0) this.root.opts.inputValue.current = "";
				} else if (value === "" && prevValue !== "") this.root.opts.inputValue.current = "";
			});
		}
		onkeydown(e) {
			this.root.isUsingKeyboard = true;
			if (e.key === "Escape") return;
			if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
			if (!this.root.opts.open.current) {
				if (INTERACTION_KEYS.includes(e.key)) return;
				if (e.key === "Tab") return;
				if (e.key === "Backspace" && this.root.opts.inputValue.current === "") return;
				this.root.handleOpen();
				if (this.root.hasValue) return;
				const candidateNodes = this.root.getCandidateNodes();
				if (!candidateNodes.length) return;
				if (e.key === "ArrowDown") {
					const firstCandidate = candidateNodes[0];
					this.root.setHighlightedNode(firstCandidate);
				} else if (e.key === "ArrowUp") {
					const lastCandidate = candidateNodes[candidateNodes.length - 1];
					this.root.setHighlightedNode(lastCandidate);
				}
				return;
			}
			if (e.key === "Tab") {
				this.root.handleClose();
				return;
			}
			if (e.key === "Enter" && !e.isComposing) {
				e.preventDefault();
				const isCurrentSelectedValue = this.root.highlightedValue === this.root.opts.value.current;
				if (!this.root.opts.allowDeselect.current && isCurrentSelectedValue && !this.root.isMulti) {
					this.root.handleClose();
					return;
				}
				if (this.root.highlightedValue && this.root.highlightedNode && this.root.highlightedNode.isConnected) this.root.toggleItem(this.root.highlightedValue, this.root.highlightedLabel ?? void 0);
				if (!this.root.isMulti && !isCurrentSelectedValue) this.root.handleClose();
			}
			if (e.key === "ArrowUp" && e.altKey) this.root.handleClose();
			if (FIRST_LAST_KEYS.includes(e.key)) {
				e.preventDefault();
				const candidateNodes = this.root.getCandidateNodes();
				const currHighlightedNode = this.root.highlightedNode;
				const currIndex = currHighlightedNode ? candidateNodes.indexOf(currHighlightedNode) : -1;
				const loop = this.root.opts.loop.current;
				let nextItem;
				if (e.key === "ArrowDown") nextItem = next(candidateNodes, currIndex, loop);
				else if (e.key === "ArrowUp") nextItem = prev(candidateNodes, currIndex, loop);
				else if (e.key === "PageDown") nextItem = forward(candidateNodes, currIndex, 10, loop);
				else if (e.key === "PageUp") nextItem = backward(candidateNodes, currIndex, 10, loop);
				else if (e.key === "Home") nextItem = candidateNodes[0];
				else if (e.key === "End") nextItem = candidateNodes[candidateNodes.length - 1];
				if (!nextItem) return;
				this.root.setHighlightedNode(nextItem);
				return;
			}
			if (INTERACTION_KEYS.includes(e.key)) return;
			if (!this.root.highlightedNode) this.root.setHighlightedToFirstCandidate();
		}
		oninput(e) {
			this.root.opts.inputValue.current = e.currentTarget.value;
			afterTick(() => {
				if (!this.root.opts.open.current) return;
				this.root.setHighlightedToFirstCandidate();
			});
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "combobox",
			disabled: this.root.opts.disabled.current ? true : void 0,
			"aria-activedescendant": this.root.highlightedId,
			"aria-autocomplete": "list",
			"aria-expanded": boolToStr(this.root.opts.open.current),
			"data-state": getDataOpenClosed(this.root.opts.open.current),
			"data-disabled": boolToEmptyStrOrUndef(this.root.opts.disabled.current),
			onkeydown: this.onkeydown,
			oninput: this.oninput,
			[this.root.getBitsAttr("input")]: "",
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var SelectComboTriggerState = class SelectComboTriggerState {
		static create(opts) {
			return new SelectComboTriggerState(opts, SelectRootContext.get());
		}
		opts;
		root;
		attachment;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref);
			this.onkeydown = this.onkeydown.bind(this);
			this.onpointerdown = this.onpointerdown.bind(this);
		}
		onkeydown(e) {
			if (!this.root.domContext) return;
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				if (this.root.domContext.getActiveElement() !== this.root.inputNode) this.root.inputNode?.focus();
				this.root.toggleMenu();
			}
		}
		/**
		* `pointerdown` fires before the `focus` event, so we can prevent the default
		* behavior of focusing the button and keep focus on the input.
		*/
		onpointerdown(e) {
			if (this.root.opts.disabled.current || !this.root.domContext) return;
			e.preventDefault();
			if (this.root.domContext.getActiveElement() !== this.root.inputNode) this.root.inputNode?.focus();
			this.root.toggleMenu();
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			disabled: this.root.opts.disabled.current ? true : void 0,
			"aria-haspopup": "listbox",
			"data-state": getDataOpenClosed(this.root.opts.open.current),
			"data-disabled": boolToEmptyStrOrUndef(this.root.opts.disabled.current),
			[this.root.getBitsAttr("trigger")]: "",
			onpointerdown: this.onpointerdown,
			onkeydown: this.onkeydown,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var SelectTriggerState = class SelectTriggerState {
		static create(opts) {
			return new SelectTriggerState(opts, SelectRootContext.get());
		}
		opts;
		root;
		attachment;
		#domTypeahead;
		#dataTypeahead;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref, (v) => this.root.triggerNode = v);
			this.root.domContext = new DOMContext(opts.ref);
			this.#domTypeahead = new DOMTypeahead({
				getCurrentItem: () => this.root.highlightedNode,
				onMatch: (node) => {
					this.root.setHighlightedNode(node);
				},
				getActiveElement: () => this.root.domContext.getActiveElement(),
				getWindow: () => this.root.domContext.getWindow()
			});
			this.#dataTypeahead = new DataTypeahead({
				getCurrentItem: () => {
					if (this.root.isMulti) return "";
					return this.root.currentLabel;
				},
				onMatch: (label) => {
					if (this.root.isMulti) return;
					if (!this.root.opts.items.current) return;
					const matchedItem = this.root.opts.items.current.find((item) => item.label === label);
					if (!matchedItem) return;
					this.root.opts.value.current = matchedItem.value;
				},
				enabled: () => !this.root.isMulti && this.root.dataTypeaheadEnabled,
				candidateValues: () => this.root.isMulti ? [] : this.root.candidateLabels,
				getWindow: () => this.root.domContext.getWindow()
			});
			this.onkeydown = this.onkeydown.bind(this);
			this.onpointerdown = this.onpointerdown.bind(this);
			this.onpointerup = this.onpointerup.bind(this);
			this.onclick = this.onclick.bind(this);
		}
		#handleOpen() {
			this.root.opts.open.current = true;
			this.#dataTypeahead.resetTypeahead();
			this.#domTypeahead.resetTypeahead();
		}
		#handlePointerOpen(_) {
			this.#handleOpen();
		}
		/**
		* Logic used to handle keyboard selection/deselection.
		*
		* If it returns true, it means the item was selected and whatever is calling
		* this function should return early
		*
		*/
		#handleKeyboardSelection() {
			const isCurrentSelectedValue = this.root.highlightedValue === this.root.opts.value.current;
			if (!this.root.opts.allowDeselect.current && isCurrentSelectedValue && !this.root.isMulti) {
				this.root.handleClose();
				return true;
			}
			if (this.root.highlightedValue !== null) this.root.toggleItem(this.root.highlightedValue, this.root.highlightedLabel ?? void 0);
			if (!this.root.isMulti && !isCurrentSelectedValue) {
				this.root.handleClose();
				return true;
			}
			return false;
		}
		onkeydown(e) {
			this.root.isUsingKeyboard = true;
			if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
			if (!this.root.opts.open.current) {
				if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
					e.preventDefault();
					this.root.handleOpen();
				} else if (!this.root.isMulti && this.root.dataTypeaheadEnabled) {
					this.#dataTypeahead.handleTypeaheadSearch(e.key);
					return;
				}
				if (this.root.hasValue) return;
				const candidateNodes = this.root.getCandidateNodes();
				if (!candidateNodes.length) return;
				if (e.key === "ArrowDown") {
					const firstCandidate = candidateNodes[0];
					this.root.setHighlightedNode(firstCandidate);
				} else if (e.key === "ArrowUp") {
					const lastCandidate = candidateNodes[candidateNodes.length - 1];
					this.root.setHighlightedNode(lastCandidate);
				}
				return;
			}
			if (e.key === "Tab") {
				this.root.handleClose();
				return;
			}
			if ((e.key === "Enter" || e.key === " " && this.#domTypeahead.search === "") && !e.isComposing) {
				e.preventDefault();
				if (this.#handleKeyboardSelection()) return;
			}
			if (e.key === "ArrowUp" && e.altKey) this.root.handleClose();
			if (FIRST_LAST_KEYS.includes(e.key)) {
				e.preventDefault();
				const candidateNodes = this.root.getCandidateNodes();
				const currHighlightedNode = this.root.highlightedNode;
				const currIndex = currHighlightedNode ? candidateNodes.indexOf(currHighlightedNode) : -1;
				const loop = this.root.opts.loop.current;
				let nextItem;
				if (e.key === "ArrowDown") nextItem = next(candidateNodes, currIndex, loop);
				else if (e.key === "ArrowUp") nextItem = prev(candidateNodes, currIndex, loop);
				else if (e.key === "PageDown") nextItem = forward(candidateNodes, currIndex, 10, loop);
				else if (e.key === "PageUp") nextItem = backward(candidateNodes, currIndex, 10, loop);
				else if (e.key === "Home") nextItem = candidateNodes[0];
				else if (e.key === "End") nextItem = candidateNodes[candidateNodes.length - 1];
				if (!nextItem) return;
				this.root.setHighlightedNode(nextItem);
				return;
			}
			const isModifierKey = e.ctrlKey || e.altKey || e.metaKey;
			const isCharacterKey = e.key.length === 1;
			const isSpaceKey = e.key === " ";
			const candidateNodes = this.root.getCandidateNodes();
			if (e.key === "Tab") return;
			if (!isModifierKey && (isCharacterKey || isSpaceKey)) {
				if (!this.#domTypeahead.handleTypeaheadSearch(e.key, candidateNodes) && isSpaceKey) {
					e.preventDefault();
					this.#handleKeyboardSelection();
				}
				return;
			}
			if (!this.root.highlightedNode) this.root.setHighlightedToFirstCandidate();
		}
		onclick(e) {
			e.currentTarget.focus();
		}
		onpointerdown(e) {
			if (this.root.opts.disabled.current) return;
			if (e.pointerType === "touch") return e.preventDefault();
			const target = e.target;
			if (target?.hasPointerCapture(e.pointerId)) target?.releasePointerCapture(e.pointerId);
			if (e.button === 0 && e.ctrlKey === false) {
				if (this.root.opts.open.current === false) this.#handlePointerOpen(e);
				else this.root.handleClose();
			}
		}
		onpointerup(e) {
			if (this.root.opts.disabled.current) return;
			e.preventDefault();
			if (e.pointerType === "touch") {
				if (this.root.opts.open.current === false) this.#handlePointerOpen(e);
				else this.root.handleClose();
			}
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			disabled: this.root.opts.disabled.current ? true : void 0,
			"aria-haspopup": "listbox",
			"aria-expanded": boolToStr(this.root.opts.open.current),
			"aria-activedescendant": this.root.highlightedId,
			"data-state": getDataOpenClosed(this.root.opts.open.current),
			"data-disabled": boolToEmptyStrOrUndef(this.root.opts.disabled.current),
			"data-placeholder": this.root.hasValue ? void 0 : "",
			[this.root.getBitsAttr("trigger")]: "",
			onpointerdown: this.onpointerdown,
			onkeydown: this.onkeydown,
			onclick: this.onclick,
			onpointerup: this.onpointerup,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var SelectContentState = class SelectContentState {
		static create(opts) {
			return SelectContentContext.set(new SelectContentState(opts, SelectRootContext.get()));
		}
		opts;
		root;
		attachment;
		#isPositioned = /* @__PURE__ */ state(false);
		get isPositioned() {
			return get$2(this.#isPositioned);
		}
		set isPositioned(value) {
			set(this.#isPositioned, value, true);
		}
		userHasScrolled = false;
		domContext;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref, (v) => this.root.contentNode = v);
			this.domContext = new DOMContext(this.opts.ref);
			if (this.root.domContext === null) this.root.domContext = this.domContext;
			onDestroyEffect(() => {
				this.root.contentNode = null;
				this.root.contentIsPositioned = false;
				this.isPositioned = false;
			});
			watch(() => this.root.opts.open.current, () => {
				if (this.root.opts.open.current) return;
				this.root.contentIsPositioned = false;
				this.isPositioned = false;
				this.userHasScrolled = false;
			});
			watch([() => this.isPositioned, () => this.root.highlightedNode], () => {
				if (!this.isPositioned || !this.root.highlightedNode) return;
				this.root.scrollHighlightedNodeIntoView(this.root.highlightedNode);
			});
			this.onpointermove = this.onpointermove.bind(this);
		}
		onpointermove(_) {
			this.root.isUsingKeyboard = false;
		}
		#styles = /* @__PURE__ */ user_derived(() => {
			return getFloatingContentCSSVars(this.root.isCombobox ? "combobox" : "select");
		});
		onInteractOutside = (e) => {
			if (e.target === this.root.triggerNode || e.target === this.root.inputNode) {
				e.preventDefault();
				return;
			}
			this.opts.onInteractOutside.current(e);
			if (e.defaultPrevented) return;
			this.root.handleClose();
		};
		onEscapeKeydown = (e) => {
			this.opts.onEscapeKeydown.current(e);
			if (e.defaultPrevented) return;
			this.root.handleClose();
		};
		onOpenAutoFocus = (e) => {
			e.preventDefault();
		};
		onCloseAutoFocus = (e) => {
			e.preventDefault();
		};
		get shouldRender() {
			return this.root.contentPresence.shouldRender;
		}
		#snippetProps = /* @__PURE__ */ user_derived(() => ({ open: this.root.opts.open.current }));
		get snippetProps() {
			return get$2(this.#snippetProps);
		}
		set snippetProps(value) {
			set(this.#snippetProps, value);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "listbox",
			"aria-multiselectable": this.root.isMulti ? "true" : void 0,
			"data-state": getDataOpenClosed(this.root.opts.open.current),
			...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
			[this.root.getBitsAttr("content")]: "",
			style: {
				display: "flex",
				flexDirection: "column",
				outline: "none",
				boxSizing: "border-box",
				pointerEvents: "auto",
				...get$2(this.#styles)
			},
			onpointermove: this.onpointermove,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
		popperProps = {
			onInteractOutside: this.onInteractOutside,
			onEscapeKeydown: this.onEscapeKeydown,
			onOpenAutoFocus: this.onOpenAutoFocus,
			onCloseAutoFocus: this.onCloseAutoFocus,
			trapFocus: false,
			loop: false,
			onPlaced: () => {
				if (this.root.opts.open.current) {
					this.root.contentIsPositioned = true;
					this.isPositioned = true;
				}
			}
		};
	};
	var SelectItemState = class SelectItemState {
		static create(opts) {
			return new SelectItemState(opts, SelectRootContext.get());
		}
		opts;
		root;
		attachment;
		#isSelected = /* @__PURE__ */ user_derived(() => this.root.includesItem(this.opts.value.current));
		get isSelected() {
			return get$2(this.#isSelected);
		}
		set isSelected(value) {
			set(this.#isSelected, value);
		}
		#isHighlighted = /* @__PURE__ */ user_derived(() => this.root.highlightedValue === this.opts.value.current);
		get isHighlighted() {
			return get$2(this.#isHighlighted);
		}
		set isHighlighted(value) {
			set(this.#isHighlighted, value);
		}
		prevHighlighted = new Previous(() => this.isHighlighted);
		#mounted = /* @__PURE__ */ state(false);
		get mounted() {
			return get$2(this.#mounted);
		}
		set mounted(value) {
			set(this.#mounted, value, true);
		}
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref);
			watch([() => this.isHighlighted, () => this.prevHighlighted.current], () => {
				if (this.isHighlighted) this.opts.onHighlight.current();
				else if (this.prevHighlighted.current) this.opts.onUnhighlight.current();
			});
			watch(() => this.mounted, () => {
				if (!this.mounted) return;
				this.root.setInitialHighlightedNode();
			});
			this.onpointerdown = this.onpointerdown.bind(this);
			this.onpointerup = this.onpointerup.bind(this);
			this.onpointermove = this.onpointermove.bind(this);
		}
		handleSelect() {
			if (this.opts.disabled.current) return;
			const isCurrentSelectedValue = this.opts.value.current === this.root.opts.value.current;
			if (!this.root.opts.allowDeselect.current && isCurrentSelectedValue && !this.root.isMulti) {
				this.root.handleClose();
				return;
			}
			this.root.toggleItem(this.opts.value.current, this.opts.label.current);
			if (!this.root.isMulti && !isCurrentSelectedValue) this.root.handleClose();
		}
		#snippetProps = /* @__PURE__ */ user_derived(() => ({
			selected: this.isSelected,
			highlighted: this.isHighlighted
		}));
		get snippetProps() {
			return get$2(this.#snippetProps);
		}
		set snippetProps(value) {
			set(this.#snippetProps, value);
		}
		onpointerdown(e) {
			e.preventDefault();
		}
		/**
		* Using `pointerup` instead of `click` allows power users to pointerdown
		* the trigger, then release pointerup on an item to select it vs having to do
		* multiple clicks.
		*/
		onpointerup(e) {
			if (e.defaultPrevented || !this.opts.ref.current) return;
			/**
			* For one reason or another, when it's a touch pointer and _not_ on IOS,
			* we need to listen for the immediate click event to handle the selection,
			* otherwise a click event will fire on the element _behind_ the item.
			*/
			if (e.pointerType === "touch" && !isIOS) {
				on(this.opts.ref.current, "click", () => {
					this.handleSelect();
					this.root.setHighlightedNode(this.opts.ref.current);
				}, { once: true });
				return;
			}
			e.preventDefault();
			this.handleSelect();
			if (e.pointerType === "touch") this.root.setHighlightedNode(this.opts.ref.current);
		}
		onpointermove(e) {
			/**
			* We don't want to highlight items on touch devices when scrolling,
			* as this is confusing behavior, so we return here and instead handle
			* the highlighting on the `pointerup` (or following `click`) event for
			* touch devices only.
			*/
			if (e.pointerType === "touch") return;
			if (this.root.highlightedNode !== this.opts.ref.current) this.root.setHighlightedNode(this.opts.ref.current);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "option",
			"aria-selected": this.root.includesItem(this.opts.value.current) ? "true" : void 0,
			"data-value": this.opts.value.current,
			"data-disabled": boolToEmptyStrOrUndef(this.opts.disabled.current),
			"data-highlighted": this.root.highlightedValue === this.opts.value.current && !this.opts.disabled.current ? "" : void 0,
			"data-selected": this.root.includesItem(this.opts.value.current) ? "" : void 0,
			"data-label": this.opts.label.current,
			[this.root.getBitsAttr("item")]: "",
			onpointermove: this.onpointermove,
			onpointerdown: this.onpointerdown,
			onpointerup: this.onpointerup,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var SelectHiddenInputState = class SelectHiddenInputState {
		static create(opts) {
			return new SelectHiddenInputState(opts, SelectRootContext.get());
		}
		opts;
		root;
		#shouldRender = /* @__PURE__ */ user_derived(() => this.root.opts.name.current !== "");
		get shouldRender() {
			return get$2(this.#shouldRender);
		}
		set shouldRender(value) {
			set(this.#shouldRender, value);
		}
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.onfocus = this.onfocus.bind(this);
		}
		onfocus(e) {
			e.preventDefault();
			if (!this.root.isCombobox) this.root.triggerNode?.focus();
			else this.root.inputNode?.focus();
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			disabled: boolToTrueOrUndef(this.root.opts.disabled.current),
			required: boolToTrueOrUndef(this.root.opts.required.current),
			name: this.root.opts.name.current,
			value: this.opts.value.current,
			onfocus: this.onfocus
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var SelectViewportState = class SelectViewportState {
		static create(opts) {
			return new SelectViewportState(opts, SelectContentContext.get());
		}
		opts;
		content;
		root;
		attachment;
		#prevScrollTop = /* @__PURE__ */ state(0);
		get prevScrollTop() {
			return get$2(this.#prevScrollTop);
		}
		set prevScrollTop(value) {
			set(this.#prevScrollTop, value, true);
		}
		constructor(opts, content) {
			this.opts = opts;
			this.content = content;
			this.root = content.root;
			this.attachment = attachRef(opts.ref, (v) => {
				this.root.viewportNode = v;
			});
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "presentation",
			[this.root.getBitsAttr("viewport")]: "",
			style: {
				position: "relative",
				flex: 1,
				overflow: "auto"
			},
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select-hidden-input.svelte
	function Select_hidden_input($$anchor, $$props) {
		push($$props, true);
		let value = prop($$props, "value", 15);
		const hiddenInputState = SelectHiddenInputState.create({ value: boxWith(() => value()) });
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			Hidden_input($$anchor, spread_props(() => hiddenInputState.props, {
				get autocomplete() {
					return $$props.autocomplete;
				},
				get value() {
					return value();
				},
				set value($$value) {
					value($$value);
				}
			}));
		};
		if_block(node, ($$render) => {
			if (hiddenInputState.shouldRender) $$render(consequent);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/combobox/components/combobox.svelte
	var root$33 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	function Combobox($$anchor, $$props) {
		push($$props, true);
		let value = prop($$props, "value", 15), onValueChange = prop($$props, "onValueChange", 3, noop), name = prop($$props, "name", 3, ""), disabled = prop($$props, "disabled", 3, false), open = prop($$props, "open", 15, false), onOpenChange = prop($$props, "onOpenChange", 3, noop), onOpenChangeComplete = prop($$props, "onOpenChangeComplete", 3, noop), loop = prop($$props, "loop", 3, false), scrollAlignment = prop($$props, "scrollAlignment", 3, "nearest"), required = prop($$props, "required", 3, false), items = prop($$props, "items", 19, () => []), allowDeselect = prop($$props, "allowDeselect", 3, true), inputValue = prop($$props, "inputValue", 7, "");
		if (value() === void 0) value($$props.type === "single" ? "" : []);
		watch.pre(() => value(), () => {
			if (value() !== void 0) return;
			value($$props.type === "single" ? "" : []);
		});
		const rootState = SelectRootState.create({
			type: $$props.type,
			value: boxWith(() => value(), (v) => {
				value(v);
				onValueChange()(v);
			}),
			disabled: boxWith(() => disabled()),
			required: boxWith(() => required()),
			open: boxWith(() => open(), (v) => {
				open(v);
				onOpenChange()(v);
			}),
			loop: boxWith(() => loop()),
			scrollAlignment: boxWith(() => scrollAlignment()),
			name: boxWith(() => name()),
			isCombobox: true,
			items: boxWith(() => items()),
			allowDeselect: boxWith(() => allowDeselect()),
			inputValue: boxWith(() => inputValue(), (v) => inputValue(v)),
			onOpenChangeComplete: boxWith(() => onOpenChangeComplete())
		});
		var fragment = root$33();
		var node = first_child(fragment);
		Floating_layer(node, {
			children: ($$anchor, $$slotProps) => {
				var fragment_1 = comment();
				snippet(first_child(fragment_1), () => $$props.children ?? noop$1);
				append($$anchor, fragment_1);
			},
			$$slots: { default: true }
		});
		var node_2 = sibling(node, 2);
		var consequent_1 = ($$anchor) => {
			var fragment_2 = comment();
			var node_3 = first_child(fragment_2);
			var consequent = ($$anchor) => {
				var fragment_3 = comment();
				each(first_child(fragment_3), 16, () => rootState.opts.value.current, (item) => item, ($$anchor, item) => {
					Select_hidden_input($$anchor, { get value() {
						return item;
					} });
				});
				append($$anchor, fragment_3);
			};
			if_block(node_3, ($$render) => {
				if (rootState.opts.value.current.length) $$render(consequent);
			});
			append($$anchor, fragment_2);
		};
		var d = /* @__PURE__ */ user_derived(() => Array.isArray(rootState.opts.value.current));
		var alternate = ($$anchor) => {
			Select_hidden_input($$anchor, {
				get value() {
					return rootState.opts.value.current;
				},
				set value($$value) {
					rootState.opts.value.current = $$value;
				}
			});
		};
		if_block(node_2, ($$render) => {
			if (get$2(d)) $$render(consequent_1);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-anchor.svelte
	function Floating_layer_anchor($$anchor, $$props) {
		push($$props, true);
		let tooltip = prop($$props, "tooltip", 3, false);
		FloatingAnchorState.create({
			id: boxWith(() => $$props.id),
			virtualEl: boxWith(() => $$props.virtualEl),
			ref: $$props.ref
		}, tooltip());
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.children ?? noop$1);
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-content.svelte
	function Floating_layer_content($$anchor, $$props) {
		push($$props, true);
		let side = prop($$props, "side", 3, "bottom"), sideOffset = prop($$props, "sideOffset", 3, 0), align = prop($$props, "align", 3, "center"), alignOffset = prop($$props, "alignOffset", 3, 0), arrowPadding = prop($$props, "arrowPadding", 3, 0), avoidCollisions = prop($$props, "avoidCollisions", 3, true), collisionBoundary = prop($$props, "collisionBoundary", 19, () => []), collisionPadding = prop($$props, "collisionPadding", 3, 0), hideWhenDetached = prop($$props, "hideWhenDetached", 3, false), onPlaced = prop($$props, "onPlaced", 3, () => {}), sticky = prop($$props, "sticky", 3, "partial"), updatePositionStrategy = prop($$props, "updatePositionStrategy", 3, "optimized"), strategy = prop($$props, "strategy", 3, "fixed"), dir = prop($$props, "dir", 3, "ltr"), style = prop($$props, "style", 19, () => ({})), wrapperId = prop($$props, "wrapperId", 19, useId), customAnchor = prop($$props, "customAnchor", 3, null), tooltip = prop($$props, "tooltip", 3, false);
		const contentState = FloatingContentState.create({
			side: boxWith(() => side()),
			sideOffset: boxWith(() => sideOffset()),
			align: boxWith(() => align()),
			alignOffset: boxWith(() => alignOffset()),
			id: boxWith(() => $$props.id),
			arrowPadding: boxWith(() => arrowPadding()),
			avoidCollisions: boxWith(() => avoidCollisions()),
			collisionBoundary: boxWith(() => collisionBoundary()),
			collisionPadding: boxWith(() => collisionPadding()),
			hideWhenDetached: boxWith(() => hideWhenDetached()),
			onPlaced: boxWith(() => onPlaced()),
			sticky: boxWith(() => sticky()),
			updatePositionStrategy: boxWith(() => updatePositionStrategy()),
			strategy: boxWith(() => strategy()),
			dir: boxWith(() => dir()),
			style: boxWith(() => style()),
			enabled: boxWith(() => $$props.enabled),
			wrapperId: boxWith(() => wrapperId()),
			customAnchor: boxWith(() => customAnchor())
		}, tooltip());
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(contentState.wrapperProps, { style: { pointerEvents: "auto" } }));
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.content ?? noop$1, () => ({
			props: contentState.props,
			wrapperProps: get$2(mergedProps)
		}));
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-content-static.svelte
	function Floating_layer_content_static($$anchor, $$props) {
		push($$props, true);
		onMount(() => {
			$$props.onPlaced?.();
		});
		var fragment = comment();
		snippet(first_child(fragment), () => $$props.content ?? noop$1, () => ({
			props: {},
			wrapperProps: {}
		}));
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/combobox/components/combobox-input.svelte
	var rest_excludes$30 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"child",
		"defaultValue",
		"clearOnDeselect"
	]);
	var root$32 = /* @__PURE__ */ from_tree([["input"]]);
	function Combobox_input($$anchor, $$props) {
		push($$props, true);
		let id = prop($$props, "id", 19, useId), ref = prop($$props, "ref", 15, null), clearOnDeselect = prop($$props, "clearOnDeselect", 3, false), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$30);
		const inputState = SelectInputState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v)),
			clearOnDeselect: boxWith(() => clearOnDeselect())
		});
		if ($$props.defaultValue) inputState.root.opts.inputValue.current = $$props.defaultValue;
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, inputState.props, { value: inputState.root.opts.inputValue.current }));
		var fragment = comment();
		component(first_child(fragment), () => Floating_layer_anchor, ($$anchor, FloatingLayer_Anchor) => {
			FloatingLayer_Anchor($$anchor, {
				get id() {
					return id();
				},
				get ref() {
					return inputState.opts.ref;
				},
				children: ($$anchor, $$slotProps) => {
					var fragment_1 = comment();
					var node_1 = first_child(fragment_1);
					var consequent = ($$anchor) => {
						var fragment_2 = comment();
						snippet(first_child(fragment_2), () => $$props.child, () => ({ props: get$2(mergedProps) }));
						append($$anchor, fragment_2);
					};
					var alternate = ($$anchor) => {
						var input = root$32();
						attribute_effect(input, () => ({ ...get$2(mergedProps) }), void 0, void 0, void 0, void 0, true);
						append($$anchor, input);
					};
					if_block(node_1, ($$render) => {
						if ($$props.child) $$render(consequent);
						else $$render(alternate, -1);
					});
					append($$anchor, fragment_1);
				},
				$$slots: { default: true }
			});
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/combobox/components/combobox-trigger.svelte
	var rest_excludes$29 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"child",
		"children",
		"type"
	]);
	var root$31 = /* @__PURE__ */ from_tree([[
		"button",
		null,
		,
	]]);
	function Combobox_trigger($$anchor, $$props) {
		push($$props, true);
		let id = prop($$props, "id", 19, useId), ref = prop($$props, "ref", 15, null), type = prop($$props, "type", 3, "button"), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$29);
		const triggerState = SelectComboTriggerState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, triggerState.props, { type: type() }));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var button = root$31();
			attribute_effect(button, () => ({ ...get$2(mergedProps) }));
			snippet(child(button), () => $$props.children ?? noop$1);
			reset(button);
			append($$anchor, button);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-content.svelte
	var rest_excludes$28 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"content",
		"isStatic",
		"onPlaced"
	]);
	function Popper_content($$anchor, $$props) {
		let isStatic = prop($$props, "isStatic", 3, false), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$28);
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			Floating_layer_content_static($$anchor, {
				get content() {
					return $$props.content;
				},
				get onPlaced() {
					return $$props.onPlaced;
				}
			});
		};
		var alternate = ($$anchor) => {
			Floating_layer_content($$anchor, spread_props({
				get content() {
					return $$props.content;
				},
				get onPlaced() {
					return $$props.onPlaced;
				}
			}, () => restProps));
		};
		if_block(node, ($$render) => {
			if (isStatic()) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-inner.svelte
	var rest_excludes$27 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"popper",
		"onEscapeKeydown",
		"escapeKeydownBehavior",
		"preventOverflowTextSelection",
		"id",
		"onPointerDown",
		"onPointerUp",
		"side",
		"sideOffset",
		"align",
		"alignOffset",
		"arrowPadding",
		"avoidCollisions",
		"collisionBoundary",
		"collisionPadding",
		"sticky",
		"hideWhenDetached",
		"updatePositionStrategy",
		"strategy",
		"dir",
		"preventScroll",
		"wrapperId",
		"style",
		"onPlaced",
		"onInteractOutside",
		"onCloseAutoFocus",
		"onOpenAutoFocus",
		"onFocusOutside",
		"interactOutsideBehavior",
		"loop",
		"trapFocus",
		"isValidEvent",
		"customAnchor",
		"isStatic",
		"enabled",
		"ref",
		"tooltip",
		"contentPointerEvents"
	]);
	var root$30 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	function Popper_layer_inner($$anchor, $$props) {
		push($$props, true);
		let interactOutsideBehavior = prop($$props, "interactOutsideBehavior", 3, "close"), trapFocus = prop($$props, "trapFocus", 3, true), isValidEvent = prop($$props, "isValidEvent", 3, () => false), customAnchor = prop($$props, "customAnchor", 3, null), isStatic = prop($$props, "isStatic", 3, false), tooltip = prop($$props, "tooltip", 3, false), contentPointerEvents = prop($$props, "contentPointerEvents", 3, "auto"), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$27);
		const resolvedPreventScroll = /* @__PURE__ */ user_derived(() => $$props.preventScroll ?? true);
		const effectiveStrategy = /* @__PURE__ */ user_derived(() => $$props.strategy ?? (get$2(resolvedPreventScroll) ? "fixed" : "absolute"));
		{
			const content = ($$anchor, $$arg0) => {
				let floatingProps = () => ($$arg0?.()).props;
				let wrapperProps = () => ($$arg0?.()).wrapperProps;
				var fragment_1 = root$30();
				var node = first_child(fragment_1);
				var consequent = ($$anchor) => {
					Scroll_lock($$anchor, { get preventScroll() {
						return get$2(resolvedPreventScroll);
					} });
				};
				var consequent_1 = ($$anchor) => {
					Scroll_lock($$anchor, { get preventScroll() {
						return get$2(resolvedPreventScroll);
					} });
				};
				if_block(node, ($$render) => {
					if ($$props.forceMount && $$props.enabled) $$render(consequent);
					else if (!$$props.forceMount) $$render(consequent_1, 1);
				});
				var node_1 = sibling(node, 2);
				{
					const focusScope = ($$anchor, $$arg0) => {
						let focusScopeProps = () => ($$arg0?.()).props;
						Escape_layer($$anchor, {
							get onEscapeKeydown() {
								return $$props.onEscapeKeydown;
							},
							get escapeKeydownBehavior() {
								return $$props.escapeKeydownBehavior;
							},
							get enabled() {
								return $$props.enabled;
							},
							get ref() {
								return $$props.ref;
							},
							children: ($$anchor, $$slotProps) => {
								{
									const children = ($$anchor, $$arg0) => {
										let dismissibleProps = () => ($$arg0?.()).props;
										Text_selection_layer($$anchor, {
											get id() {
												return $$props.id;
											},
											get preventOverflowTextSelection() {
												return $$props.preventOverflowTextSelection;
											},
											get onPointerDown() {
												return $$props.onPointerDown;
											},
											get onPointerUp() {
												return $$props.onPointerUp;
											},
											get enabled() {
												return $$props.enabled;
											},
											get ref() {
												return $$props.ref;
											},
											children: ($$anchor, $$slotProps) => {
												var fragment_7 = comment();
												var node_2 = first_child(fragment_7);
												{
													let $0 = /* @__PURE__ */ user_derived(() => ({
														props: mergeProps(restProps, floatingProps(), dismissibleProps(), focusScopeProps(), {
															id: $$props.id,
															style: { pointerEvents: contentPointerEvents() }
														}),
														wrapperProps: wrapperProps()
													}));
													snippet(node_2, () => $$props.popper ?? noop$1, () => get$2($0));
												}
												append($$anchor, fragment_7);
											},
											$$slots: { default: true }
										});
									};
									Dismissible_layer($$anchor, {
										get id() {
											return $$props.id;
										},
										get onInteractOutside() {
											return $$props.onInteractOutside;
										},
										get onFocusOutside() {
											return $$props.onFocusOutside;
										},
										get interactOutsideBehavior() {
											return interactOutsideBehavior();
										},
										get isValidEvent() {
											return isValidEvent();
										},
										get enabled() {
											return $$props.enabled;
										},
										get ref() {
											return $$props.ref;
										},
										children,
										$$slots: { default: true }
									});
								}
							},
							$$slots: { default: true }
						});
					};
					Focus_scope(node_1, {
						get onOpenAutoFocus() {
							return $$props.onOpenAutoFocus;
						},
						get onCloseAutoFocus() {
							return $$props.onCloseAutoFocus;
						},
						get loop() {
							return $$props.loop;
						},
						get enabled() {
							return $$props.enabled;
						},
						get trapFocus() {
							return trapFocus();
						},
						get forceMount() {
							return $$props.forceMount;
						},
						get ref() {
							return $$props.ref;
						},
						focusScope,
						$$slots: { focusScope: true }
					});
				}
				append($$anchor, fragment_1);
			};
			Popper_content($$anchor, {
				get isStatic() {
					return isStatic();
				},
				get id() {
					return $$props.id;
				},
				get side() {
					return $$props.side;
				},
				get sideOffset() {
					return $$props.sideOffset;
				},
				get align() {
					return $$props.align;
				},
				get alignOffset() {
					return $$props.alignOffset;
				},
				get arrowPadding() {
					return $$props.arrowPadding;
				},
				get avoidCollisions() {
					return $$props.avoidCollisions;
				},
				get collisionBoundary() {
					return $$props.collisionBoundary;
				},
				get collisionPadding() {
					return $$props.collisionPadding;
				},
				get sticky() {
					return $$props.sticky;
				},
				get hideWhenDetached() {
					return $$props.hideWhenDetached;
				},
				get updatePositionStrategy() {
					return $$props.updatePositionStrategy;
				},
				get strategy() {
					return get$2(effectiveStrategy);
				},
				get dir() {
					return $$props.dir;
				},
				get wrapperId() {
					return $$props.wrapperId;
				},
				get style() {
					return $$props.style;
				},
				get onPlaced() {
					return $$props.onPlaced;
				},
				get customAnchor() {
					return customAnchor();
				},
				get enabled() {
					return $$props.enabled;
				},
				get tooltip() {
					return tooltip();
				},
				content,
				$$slots: { content: true }
			});
		}
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer.svelte
	var rest_excludes$26 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"popper",
		"open",
		"onEscapeKeydown",
		"escapeKeydownBehavior",
		"preventOverflowTextSelection",
		"id",
		"onPointerDown",
		"onPointerUp",
		"side",
		"sideOffset",
		"align",
		"alignOffset",
		"arrowPadding",
		"avoidCollisions",
		"collisionBoundary",
		"collisionPadding",
		"sticky",
		"hideWhenDetached",
		"updatePositionStrategy",
		"strategy",
		"dir",
		"preventScroll",
		"wrapperId",
		"style",
		"onPlaced",
		"onInteractOutside",
		"onCloseAutoFocus",
		"onOpenAutoFocus",
		"onFocusOutside",
		"interactOutsideBehavior",
		"loop",
		"trapFocus",
		"isValidEvent",
		"customAnchor",
		"isStatic",
		"ref",
		"shouldRender"
	]);
	function Popper_layer($$anchor, $$props) {
		let interactOutsideBehavior = prop($$props, "interactOutsideBehavior", 3, "close"), trapFocus = prop($$props, "trapFocus", 3, true), isValidEvent = prop($$props, "isValidEvent", 3, () => false), customAnchor = prop($$props, "customAnchor", 3, null), isStatic = prop($$props, "isStatic", 3, false), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$26);
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			Popper_layer_inner($$anchor, spread_props({
				get popper() {
					return $$props.popper;
				},
				get onEscapeKeydown() {
					return $$props.onEscapeKeydown;
				},
				get escapeKeydownBehavior() {
					return $$props.escapeKeydownBehavior;
				},
				get preventOverflowTextSelection() {
					return $$props.preventOverflowTextSelection;
				},
				get id() {
					return $$props.id;
				},
				get onPointerDown() {
					return $$props.onPointerDown;
				},
				get onPointerUp() {
					return $$props.onPointerUp;
				},
				get side() {
					return $$props.side;
				},
				get sideOffset() {
					return $$props.sideOffset;
				},
				get align() {
					return $$props.align;
				},
				get alignOffset() {
					return $$props.alignOffset;
				},
				get arrowPadding() {
					return $$props.arrowPadding;
				},
				get avoidCollisions() {
					return $$props.avoidCollisions;
				},
				get collisionBoundary() {
					return $$props.collisionBoundary;
				},
				get collisionPadding() {
					return $$props.collisionPadding;
				},
				get sticky() {
					return $$props.sticky;
				},
				get hideWhenDetached() {
					return $$props.hideWhenDetached;
				},
				get updatePositionStrategy() {
					return $$props.updatePositionStrategy;
				},
				get strategy() {
					return $$props.strategy;
				},
				get dir() {
					return $$props.dir;
				},
				get preventScroll() {
					return $$props.preventScroll;
				},
				get wrapperId() {
					return $$props.wrapperId;
				},
				get style() {
					return $$props.style;
				},
				get onPlaced() {
					return $$props.onPlaced;
				},
				get customAnchor() {
					return customAnchor();
				},
				get isStatic() {
					return isStatic();
				},
				get enabled() {
					return $$props.open;
				},
				get onInteractOutside() {
					return $$props.onInteractOutside;
				},
				get onCloseAutoFocus() {
					return $$props.onCloseAutoFocus;
				},
				get onOpenAutoFocus() {
					return $$props.onOpenAutoFocus;
				},
				get interactOutsideBehavior() {
					return interactOutsideBehavior();
				},
				get loop() {
					return $$props.loop;
				},
				get trapFocus() {
					return trapFocus();
				},
				get isValidEvent() {
					return isValidEvent();
				},
				get onFocusOutside() {
					return $$props.onFocusOutside;
				},
				forceMount: false,
				get ref() {
					return $$props.ref;
				}
			}, () => restProps));
		};
		if_block(node, ($$render) => {
			if ($$props.shouldRender) $$render(consequent);
		});
		append($$anchor, fragment);
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-force-mount.svelte
	var rest_excludes$25 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"popper",
		"onEscapeKeydown",
		"escapeKeydownBehavior",
		"preventOverflowTextSelection",
		"id",
		"onPointerDown",
		"onPointerUp",
		"side",
		"sideOffset",
		"align",
		"alignOffset",
		"arrowPadding",
		"avoidCollisions",
		"collisionBoundary",
		"collisionPadding",
		"sticky",
		"hideWhenDetached",
		"updatePositionStrategy",
		"strategy",
		"dir",
		"preventScroll",
		"wrapperId",
		"style",
		"onPlaced",
		"onInteractOutside",
		"onCloseAutoFocus",
		"onOpenAutoFocus",
		"onFocusOutside",
		"interactOutsideBehavior",
		"loop",
		"trapFocus",
		"isValidEvent",
		"customAnchor",
		"isStatic",
		"enabled"
	]);
	function Popper_layer_force_mount($$anchor, $$props) {
		let interactOutsideBehavior = prop($$props, "interactOutsideBehavior", 3, "close"), trapFocus = prop($$props, "trapFocus", 3, true), isValidEvent = prop($$props, "isValidEvent", 3, () => false), customAnchor = prop($$props, "customAnchor", 3, null), isStatic = prop($$props, "isStatic", 3, false), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$25);
		Popper_layer_inner($$anchor, spread_props({
			get popper() {
				return $$props.popper;
			},
			get onEscapeKeydown() {
				return $$props.onEscapeKeydown;
			},
			get escapeKeydownBehavior() {
				return $$props.escapeKeydownBehavior;
			},
			get preventOverflowTextSelection() {
				return $$props.preventOverflowTextSelection;
			},
			get id() {
				return $$props.id;
			},
			get onPointerDown() {
				return $$props.onPointerDown;
			},
			get onPointerUp() {
				return $$props.onPointerUp;
			},
			get side() {
				return $$props.side;
			},
			get sideOffset() {
				return $$props.sideOffset;
			},
			get align() {
				return $$props.align;
			},
			get alignOffset() {
				return $$props.alignOffset;
			},
			get arrowPadding() {
				return $$props.arrowPadding;
			},
			get avoidCollisions() {
				return $$props.avoidCollisions;
			},
			get collisionBoundary() {
				return $$props.collisionBoundary;
			},
			get collisionPadding() {
				return $$props.collisionPadding;
			},
			get sticky() {
				return $$props.sticky;
			},
			get hideWhenDetached() {
				return $$props.hideWhenDetached;
			},
			get updatePositionStrategy() {
				return $$props.updatePositionStrategy;
			},
			get strategy() {
				return $$props.strategy;
			},
			get dir() {
				return $$props.dir;
			},
			get preventScroll() {
				return $$props.preventScroll;
			},
			get wrapperId() {
				return $$props.wrapperId;
			},
			get style() {
				return $$props.style;
			},
			get onPlaced() {
				return $$props.onPlaced;
			},
			get customAnchor() {
				return customAnchor();
			},
			get isStatic() {
				return isStatic();
			},
			get enabled() {
				return $$props.enabled;
			},
			get onInteractOutside() {
				return $$props.onInteractOutside;
			},
			get onCloseAutoFocus() {
				return $$props.onCloseAutoFocus;
			},
			get onOpenAutoFocus() {
				return $$props.onOpenAutoFocus;
			},
			get interactOutsideBehavior() {
				return interactOutsideBehavior();
			},
			get loop() {
				return $$props.loop;
			},
			get trapFocus() {
				return trapFocus();
			},
			get isValidEvent() {
				return isValidEvent();
			},
			get onFocusOutside() {
				return $$props.onFocusOutside;
			}
		}, () => restProps, { forceMount: true }));
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select-content.svelte
	var rest_excludes$24 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"forceMount",
		"side",
		"onInteractOutside",
		"onEscapeKeydown",
		"children",
		"child",
		"preventScroll",
		"style"
	]);
	var root$29 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		[
			"div",
			null,
			,
		]
	]]);
	var root_1$15 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		[
			"div",
			null,
			,
		]
	]]);
	function Select_content($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), forceMount = prop($$props, "forceMount", 3, false), side = prop($$props, "side", 3, "bottom"), onInteractOutside = prop($$props, "onInteractOutside", 3, noop), onEscapeKeydown = prop($$props, "onEscapeKeydown", 3, noop), preventScroll = prop($$props, "preventScroll", 3, false), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$24);
		const contentState = SelectContentState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v)),
			onInteractOutside: boxWith(() => onInteractOutside()),
			onEscapeKeydown: boxWith(() => onEscapeKeydown())
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, contentState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent_1 = ($$anchor) => {
			{
				const popper = ($$anchor, $$arg0) => {
					let props = () => ($$arg0?.()).props;
					let wrapperProps = () => ($$arg0?.()).wrapperProps;
					const finalProps = /* @__PURE__ */ user_derived(() => mergeProps(props(), { style: contentState.props.style }, { style: $$props.style }));
					var fragment_2 = comment();
					var node_1 = first_child(fragment_2);
					var consequent = ($$anchor) => {
						var fragment_3 = comment();
						var node_2 = first_child(fragment_3);
						{
							let $0 = /* @__PURE__ */ user_derived(() => ({
								props: get$2(finalProps),
								wrapperProps: wrapperProps(),
								...contentState.snippetProps
							}));
							snippet(node_2, () => $$props.child, () => get$2($0));
						}
						append($$anchor, fragment_3);
					};
					var alternate = ($$anchor) => {
						var div = root$29();
						attribute_effect(div, () => ({ ...wrapperProps() }));
						var div_1 = child(div);
						attribute_effect(div_1, () => ({ ...get$2(finalProps) }));
						snippet(child(div_1), () => $$props.children ?? noop$1);
						reset(div_1);
						reset(div);
						append($$anchor, div);
					};
					if_block(node_1, ($$render) => {
						if ($$props.child) $$render(consequent);
						else $$render(alternate, -1);
					});
					append($$anchor, fragment_2);
				};
				Popper_layer_force_mount($$anchor, spread_props(() => get$2(mergedProps), () => contentState.popperProps, {
					get ref() {
						return contentState.opts.ref;
					},
					get side() {
						return side();
					},
					get enabled() {
						return contentState.root.opts.open.current;
					},
					get id() {
						return id();
					},
					get preventScroll() {
						return preventScroll();
					},
					forceMount: true,
					get shouldRender() {
						return contentState.shouldRender;
					},
					popper,
					$$slots: { popper: true }
				}));
			}
		};
		var consequent_3 = ($$anchor) => {
			{
				const popper = ($$anchor, $$arg0) => {
					let props = () => ($$arg0?.()).props;
					let wrapperProps = () => ($$arg0?.()).wrapperProps;
					const finalProps = /* @__PURE__ */ user_derived(() => mergeProps(props(), { style: contentState.props.style }, { style: $$props.style }));
					var fragment_5 = comment();
					var node_4 = first_child(fragment_5);
					var consequent_2 = ($$anchor) => {
						var fragment_6 = comment();
						var node_5 = first_child(fragment_6);
						{
							let $0 = /* @__PURE__ */ user_derived(() => ({
								props: get$2(finalProps),
								wrapperProps: wrapperProps(),
								...contentState.snippetProps
							}));
							snippet(node_5, () => $$props.child, () => get$2($0));
						}
						append($$anchor, fragment_6);
					};
					var alternate_1 = ($$anchor) => {
						var div_2 = root_1$15();
						attribute_effect(div_2, () => ({ ...wrapperProps() }));
						var div_3 = child(div_2);
						attribute_effect(div_3, () => ({ ...get$2(finalProps) }));
						snippet(child(div_3), () => $$props.children ?? noop$1);
						reset(div_3);
						reset(div_2);
						append($$anchor, div_2);
					};
					if_block(node_4, ($$render) => {
						if ($$props.child) $$render(consequent_2);
						else $$render(alternate_1, -1);
					});
					append($$anchor, fragment_5);
				};
				Popper_layer($$anchor, spread_props(() => get$2(mergedProps), () => contentState.popperProps, {
					get ref() {
						return contentState.opts.ref;
					},
					get side() {
						return side();
					},
					get open() {
						return contentState.root.opts.open.current;
					},
					get id() {
						return id();
					},
					get preventScroll() {
						return preventScroll();
					},
					forceMount: false,
					get shouldRender() {
						return contentState.shouldRender;
					},
					popper,
					$$slots: { popper: true }
				}));
			}
		};
		if_block(node, ($$render) => {
			if (forceMount()) $$render(consequent_1);
			else if (!forceMount()) $$render(consequent_3, 1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/utilities/mounted.svelte
	function Mounted($$anchor, $$props) {
		push($$props, true);
		let mounted = prop($$props, "mounted", 15, false), onMountedChange = prop($$props, "onMountedChange", 3, noop);
		onMountEffect(() => {
			mounted(true);
			onMountedChange()(true);
			return () => {
				mounted(false);
				onMountedChange()(false);
			};
		});
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select-item.svelte
	var rest_excludes$23 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"value",
		"label",
		"disabled",
		"children",
		"child",
		"onHighlight",
		"onUnhighlight"
	]);
	var root$28 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		,
	]]);
	var root_1$14 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	function Select_item($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), label = prop($$props, "label", 19, () => $$props.value), disabled = prop($$props, "disabled", 3, false), onHighlight = prop($$props, "onHighlight", 3, noop), onUnhighlight = prop($$props, "onUnhighlight", 3, noop), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$23);
		const itemState = SelectItemState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v)),
			value: boxWith(() => $$props.value),
			disabled: boxWith(() => disabled()),
			label: boxWith(() => label()),
			onHighlight: boxWith(() => onHighlight()),
			onUnhighlight: boxWith(() => onUnhighlight())
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, itemState.props));
		var fragment = root_1$14();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			var node_1 = first_child(fragment_1);
			{
				let $0 = /* @__PURE__ */ user_derived(() => ({
					props: get$2(mergedProps),
					...itemState.snippetProps
				}));
				snippet(node_1, () => $$props.child, () => get$2($0));
			}
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var div = root$28();
			attribute_effect(div, () => ({ ...get$2(mergedProps) }));
			snippet(child(div), () => $$props.children ?? noop$1, () => itemState.snippetProps);
			reset(div);
			append($$anchor, div);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		Mounted(sibling(node, 2), {
			get mounted() {
				return itemState.mounted;
			},
			set mounted($$value) {
				itemState.mounted = $$value;
			}
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select-viewport.svelte
	var rest_excludes$22 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"children",
		"child"
	]);
	var root$27 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		,
	]]);
	function Select_viewport($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$22);
		const viewportState = SelectViewportState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, viewportState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var div = root$27();
			attribute_effect(div, () => ({ ...get$2(mergedProps) }));
			snippet(child(div), () => $$props.children ?? noop$1);
			reset(div);
			append($$anchor, div);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/internal/safe-polygon.svelte.js
	function isPointInPolygon(point, polygon) {
		const [x, y] = point;
		let isInside = false;
		const length = polygon.length;
		for (let i = 0, j = length - 1; i < length; j = i++) {
			const [xi, yi] = polygon[i] ?? [0, 0];
			const [xj, yj] = polygon[j] ?? [0, 0];
			if (yi >= y !== yj >= y && x <= (xj - xi) * (y - yi) / (yj - yi) + xi) isInside = !isInside;
		}
		return isInside;
	}
	function isInsideRect(point, rect) {
		return point[0] >= rect.left && point[0] <= rect.right && point[1] >= rect.top && point[1] <= rect.bottom;
	}
	function getSide(triggerRect, contentRect) {
		const triggerCenterX = triggerRect.left + triggerRect.width / 2;
		const triggerCenterY = triggerRect.top + triggerRect.height / 2;
		const contentCenterX = contentRect.left + contentRect.width / 2;
		const contentCenterY = contentRect.top + contentRect.height / 2;
		const deltaX = contentCenterX - triggerCenterX;
		const deltaY = contentCenterY - triggerCenterY;
		if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? "right" : "left";
		return deltaY > 0 ? "bottom" : "top";
	}
	/**
	* Creates a safe polygon area that allows users to move their cursor between
	* the trigger and floating content without closing it.
	*/
	var SafePolygon = class {
		#opts;
		#buffer;
		#transitIntentTimeout;
		#exitPoint = null;
		#exitTarget = null;
		#transitTargets = [];
		#trackedTriggerNode = null;
		#leaveFallbackRafId = null;
		#transitIntentTimeoutId = null;
		#cancelLeaveFallback() {
			if (this.#leaveFallbackRafId !== null) {
				cancelAnimationFrame(this.#leaveFallbackRafId);
				this.#leaveFallbackRafId = null;
			}
		}
		#scheduleLeaveFallback() {
			this.#cancelLeaveFallback();
			this.#leaveFallbackRafId = requestAnimationFrame(() => {
				this.#leaveFallbackRafId = null;
				if (!this.#exitPoint || !this.#exitTarget) return;
				this.#clearTracking();
				this.#opts.onPointerExit();
			});
		}
		#cancelTransitIntentTimeout() {
			if (this.#transitIntentTimeoutId !== null) {
				clearTimeout(this.#transitIntentTimeoutId);
				this.#transitIntentTimeoutId = null;
			}
		}
		#scheduleTransitIntentTimeout() {
			if (this.#transitIntentTimeout === null) return;
			this.#cancelTransitIntentTimeout();
			this.#transitIntentTimeoutId = window.setTimeout(() => {
				this.#transitIntentTimeoutId = null;
				if (!this.#exitPoint || !this.#exitTarget) return;
				this.#clearTracking();
				this.#opts.onPointerExit();
			}, this.#transitIntentTimeout);
		}
		constructor(opts) {
			this.#opts = opts;
			this.#buffer = opts.buffer ?? 1;
			const transitIntentTimeout = opts.transitIntentTimeout;
			this.#transitIntentTimeout = typeof transitIntentTimeout === "number" && transitIntentTimeout > 0 ? transitIntentTimeout : null;
			watch([
				opts.triggerNode,
				opts.contentNode,
				opts.enabled
			], ([triggerNode, contentNode, enabled]) => {
				if (!triggerNode || !contentNode || !enabled) {
					this.#trackedTriggerNode = null;
					this.#clearTracking();
					return;
				}
				if (this.#trackedTriggerNode && this.#trackedTriggerNode !== triggerNode) this.#clearTracking();
				this.#trackedTriggerNode = triggerNode;
				const doc = getDocument(triggerNode);
				const handlePointerMove = (e) => {
					this.#onPointerMove([e.clientX, e.clientY], triggerNode, contentNode);
				};
				const handleTriggerLeave = (e) => {
					const target = e.relatedTarget;
					if (isElement$1(target) && contentNode.contains(target)) return;
					const ignoredTargets = this.#opts.ignoredTargets?.() ?? [];
					if (isElement$1(target) && ignoredTargets.some((n) => n === target || n.contains(target))) return;
					this.#transitTargets = isElement$1(target) && ignoredTargets.length > 0 ? ignoredTargets.filter((n) => target.contains(n)) : [];
					this.#exitPoint = [e.clientX, e.clientY];
					this.#exitTarget = "content";
					this.#scheduleLeaveFallback();
				};
				const handleTriggerEnter = () => {
					this.#clearTracking();
				};
				const handleContentEnter = () => {
					this.#clearTracking();
				};
				const handleContentLeave = (e) => {
					const target = e.relatedTarget;
					if (isElement$1(target) && triggerNode.contains(target)) return;
					this.#exitPoint = [e.clientX, e.clientY];
					this.#exitTarget = "trigger";
					this.#scheduleLeaveFallback();
				};
				return [
					on(doc, "pointermove", handlePointerMove),
					on(triggerNode, "pointerleave", handleTriggerLeave),
					on(triggerNode, "pointerenter", handleTriggerEnter),
					on(contentNode, "pointerenter", handleContentEnter),
					on(contentNode, "pointerleave", handleContentLeave)
				].reduce((acc, cleanup) => () => {
					acc();
					cleanup();
				}, () => {});
			});
		}
		#onPointerMove(clientPoint, triggerNode, contentNode) {
			if (!this.#exitPoint || !this.#exitTarget) return;
			this.#cancelLeaveFallback();
			this.#scheduleTransitIntentTimeout();
			const triggerRect = triggerNode.getBoundingClientRect();
			const contentRect = contentNode.getBoundingClientRect();
			if (this.#exitTarget === "content" && isInsideRect(clientPoint, contentRect)) {
				this.#clearTracking();
				return;
			}
			if (this.#exitTarget === "trigger" && isInsideRect(clientPoint, triggerRect)) {
				this.#clearTracking();
				return;
			}
			if (this.#exitTarget === "content" && this.#transitTargets.length > 0) for (const transitTarget of this.#transitTargets) {
				const transitRect = transitTarget.getBoundingClientRect();
				if (isInsideRect(clientPoint, transitRect)) return;
				const transitSide = getSide(triggerRect, transitRect);
				const transitCorridor = this.#getCorridorPolygon(triggerRect, transitRect, transitSide);
				if (transitCorridor && isPointInPolygon(clientPoint, transitCorridor)) return;
			}
			const side = getSide(triggerRect, contentRect);
			const corridorPoly = this.#getCorridorPolygon(triggerRect, contentRect, side);
			if (corridorPoly && isPointInPolygon(clientPoint, corridorPoly)) return;
			const targetRect = this.#exitTarget === "content" ? contentRect : triggerRect;
			if (isPointInPolygon(clientPoint, this.#getSafePolygon(this.#exitPoint, targetRect, side, this.#exitTarget))) return;
			this.#clearTracking();
			this.#opts.onPointerExit();
		}
		#clearTracking() {
			this.#exitPoint = null;
			this.#exitTarget = null;
			this.#transitTargets = [];
			this.#cancelLeaveFallback();
			this.#cancelTransitIntentTimeout();
		}
		/**
		* Creates a rectangular corridor between trigger and content
		* This prevents closing when cursor is in the gap between them
		*/
		#getCorridorPolygon(triggerRect, contentRect, side) {
			const buffer = this.#buffer;
			switch (side) {
				case "top": return [
					[Math.min(triggerRect.left, contentRect.left) - buffer, triggerRect.top],
					[Math.min(triggerRect.left, contentRect.left) - buffer, contentRect.bottom],
					[Math.max(triggerRect.right, contentRect.right) + buffer, contentRect.bottom],
					[Math.max(triggerRect.right, contentRect.right) + buffer, triggerRect.top]
				];
				case "bottom": return [
					[Math.min(triggerRect.left, contentRect.left) - buffer, triggerRect.bottom],
					[Math.min(triggerRect.left, contentRect.left) - buffer, contentRect.top],
					[Math.max(triggerRect.right, contentRect.right) + buffer, contentRect.top],
					[Math.max(triggerRect.right, contentRect.right) + buffer, triggerRect.bottom]
				];
				case "left": return [
					[triggerRect.left, Math.min(triggerRect.top, contentRect.top) - buffer],
					[contentRect.right, Math.min(triggerRect.top, contentRect.top) - buffer],
					[contentRect.right, Math.max(triggerRect.bottom, contentRect.bottom) + buffer],
					[triggerRect.left, Math.max(triggerRect.bottom, contentRect.bottom) + buffer]
				];
				case "right": return [
					[triggerRect.right, Math.min(triggerRect.top, contentRect.top) - buffer],
					[contentRect.left, Math.min(triggerRect.top, contentRect.top) - buffer],
					[contentRect.left, Math.max(triggerRect.bottom, contentRect.bottom) + buffer],
					[triggerRect.right, Math.max(triggerRect.bottom, contentRect.bottom) + buffer]
				];
			}
		}
		/**
		* Creates a triangular/trapezoidal safe zone from the exit point to the target
		*/
		#getSafePolygon(exitPoint, targetRect, side, exitTarget) {
			const buffer = this.#buffer * 4;
			const [x, y] = exitPoint;
			switch (exitTarget === "trigger" ? this.#flipSide(side) : side) {
				case "top": return [
					[x - buffer, y + buffer],
					[x + buffer, y + buffer],
					[targetRect.right + buffer, targetRect.bottom],
					[targetRect.right + buffer, targetRect.top],
					[targetRect.left - buffer, targetRect.top],
					[targetRect.left - buffer, targetRect.bottom]
				];
				case "bottom": return [
					[x - buffer, y - buffer],
					[x + buffer, y - buffer],
					[targetRect.right + buffer, targetRect.top],
					[targetRect.right + buffer, targetRect.bottom],
					[targetRect.left - buffer, targetRect.bottom],
					[targetRect.left - buffer, targetRect.top]
				];
				case "left": return [
					[x + buffer, y - buffer],
					[x + buffer, y + buffer],
					[targetRect.right, targetRect.bottom + buffer],
					[targetRect.left, targetRect.bottom + buffer],
					[targetRect.left, targetRect.top - buffer],
					[targetRect.right, targetRect.top - buffer]
				];
				case "right": return [
					[x - buffer, y - buffer],
					[x - buffer, y + buffer],
					[targetRect.left, targetRect.bottom + buffer],
					[targetRect.right, targetRect.bottom + buffer],
					[targetRect.right, targetRect.top - buffer],
					[targetRect.left, targetRect.top - buffer]
				];
			}
		}
		#flipSide(side) {
			switch (side) {
				case "top": return "bottom";
				case "bottom": return "top";
				case "left": return "right";
				case "right": return "left";
			}
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/popover/popover.svelte.js
	var popoverAttrs = createBitsAttrs({
		component: "popover",
		parts: [
			"root",
			"trigger",
			"content",
			"close",
			"overlay"
		]
	});
	var PopoverRootContext = new Context("Popover.Root");
	var PopoverRootState = class PopoverRootState {
		static create(opts) {
			return PopoverRootContext.set(new PopoverRootState(opts));
		}
		opts;
		#contentNode = /* @__PURE__ */ state(null);
		get contentNode() {
			return get$2(this.#contentNode);
		}
		set contentNode(value) {
			set(this.#contentNode, value, true);
		}
		contentPresence;
		#triggerNode = /* @__PURE__ */ state(null);
		get triggerNode() {
			return get$2(this.#triggerNode);
		}
		set triggerNode(value) {
			set(this.#triggerNode, value, true);
		}
		#overlayNode = /* @__PURE__ */ state(null);
		get overlayNode() {
			return get$2(this.#overlayNode);
		}
		set overlayNode(value) {
			set(this.#overlayNode, value, true);
		}
		overlayPresence;
		#openedViaHover = /* @__PURE__ */ state(false);
		get openedViaHover() {
			return get$2(this.#openedViaHover);
		}
		set openedViaHover(value) {
			set(this.#openedViaHover, value, true);
		}
		#hasInteractedWithContent = /* @__PURE__ */ state(false);
		get hasInteractedWithContent() {
			return get$2(this.#hasInteractedWithContent);
		}
		set hasInteractedWithContent(value) {
			set(this.#hasInteractedWithContent, value, true);
		}
		#hoverCooldown = /* @__PURE__ */ state(false);
		get hoverCooldown() {
			return get$2(this.#hoverCooldown);
		}
		set hoverCooldown(value) {
			set(this.#hoverCooldown, value, true);
		}
		#closeDelay = /* @__PURE__ */ state(0);
		get closeDelay() {
			return get$2(this.#closeDelay);
		}
		set closeDelay(value) {
			set(this.#closeDelay, value, true);
		}
		#closeTimeout = null;
		#domContext = null;
		constructor(opts) {
			this.opts = opts;
			this.contentPresence = new PresenceManager({
				ref: boxWith(() => this.contentNode),
				open: this.opts.open,
				onComplete: () => {
					this.opts.onOpenChangeComplete.current(this.opts.open.current);
				}
			});
			this.overlayPresence = new PresenceManager({
				ref: boxWith(() => this.overlayNode),
				open: this.opts.open
			});
			watch(() => this.opts.open.current, (isOpen) => {
				if (!isOpen) {
					this.openedViaHover = false;
					this.hasInteractedWithContent = false;
					this.#clearCloseTimeout();
				}
			});
		}
		setDomContext(ctx) {
			this.#domContext = ctx;
		}
		#clearCloseTimeout() {
			if (this.#closeTimeout !== null && this.#domContext) {
				this.#domContext.clearTimeout(this.#closeTimeout);
				this.#closeTimeout = null;
			}
		}
		toggleOpen() {
			this.#clearCloseTimeout();
			this.opts.open.current = !this.opts.open.current;
		}
		handleClose() {
			this.#clearCloseTimeout();
			if (!this.opts.open.current) return;
			this.opts.open.current = false;
		}
		handleHoverOpen() {
			this.#clearCloseTimeout();
			if (this.opts.open.current) return;
			this.openedViaHover = true;
			this.opts.open.current = true;
		}
		handleHoverClose() {
			if (!this.opts.open.current) return;
			if (this.openedViaHover && !this.hasInteractedWithContent) this.opts.open.current = false;
		}
		handleDelayedHoverClose() {
			if (!this.opts.open.current) return;
			if (!this.openedViaHover || this.hasInteractedWithContent) return;
			this.#clearCloseTimeout();
			if (this.closeDelay <= 0) this.opts.open.current = false;
			else if (this.#domContext) this.#closeTimeout = this.#domContext.setTimeout(() => {
				if (this.openedViaHover && !this.hasInteractedWithContent) this.opts.open.current = false;
				this.#closeTimeout = null;
			}, this.closeDelay);
		}
		cancelDelayedClose() {
			this.#clearCloseTimeout();
		}
		markInteraction() {
			this.hasInteractedWithContent = true;
			this.#clearCloseTimeout();
		}
	};
	var PopoverTriggerState = class PopoverTriggerState {
		static create(opts) {
			return new PopoverTriggerState(opts, PopoverRootContext.get());
		}
		opts;
		root;
		attachment;
		domContext;
		#openTimeout = null;
		#closeTimeout = null;
		#isHovering = /* @__PURE__ */ state(false);
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(this.opts.ref, (v) => this.root.triggerNode = v);
			this.domContext = new DOMContext(opts.ref);
			this.root.setDomContext(this.domContext);
			this.onclick = this.onclick.bind(this);
			this.onkeydown = this.onkeydown.bind(this);
			this.onpointerenter = this.onpointerenter.bind(this);
			this.onpointerleave = this.onpointerleave.bind(this);
			watch(() => this.opts.closeDelay.current, (delay) => {
				this.root.closeDelay = delay;
			});
		}
		#clearOpenTimeout() {
			if (this.#openTimeout !== null) {
				this.domContext.clearTimeout(this.#openTimeout);
				this.#openTimeout = null;
			}
		}
		#clearCloseTimeout() {
			if (this.#closeTimeout !== null) {
				this.domContext.clearTimeout(this.#closeTimeout);
				this.#closeTimeout = null;
			}
		}
		#clearAllTimeouts() {
			this.#clearOpenTimeout();
			this.#clearCloseTimeout();
		}
		onpointerenter(e) {
			if (this.opts.disabled.current) return;
			if (!this.opts.openOnHover.current) return;
			if (isTouch(e)) return;
			set(this.#isHovering, true);
			this.#clearCloseTimeout();
			this.root.cancelDelayedClose();
			if (this.root.opts.open.current || this.root.hoverCooldown) return;
			const delay = this.opts.openDelay.current;
			if (delay <= 0) this.root.handleHoverOpen();
			else this.#openTimeout = this.domContext.setTimeout(() => {
				this.root.handleHoverOpen();
				this.#openTimeout = null;
			}, delay);
		}
		onpointerleave(e) {
			if (this.opts.disabled.current) return;
			if (!this.opts.openOnHover.current) return;
			if (isTouch(e)) return;
			set(this.#isHovering, false);
			this.#clearOpenTimeout();
			this.root.hoverCooldown = false;
		}
		onclick(e) {
			if (this.opts.disabled.current) return;
			if (e.button !== 0) return;
			this.#clearAllTimeouts();
			if (get$2(this.#isHovering) && this.root.opts.open.current && this.root.openedViaHover) {
				this.root.openedViaHover = false;
				this.root.hasInteractedWithContent = true;
				return;
			}
			if (get$2(this.#isHovering) && this.opts.openOnHover.current && this.root.opts.open.current) this.root.hoverCooldown = true;
			if (this.root.hoverCooldown && !this.root.opts.open.current) this.root.hoverCooldown = false;
			this.root.toggleOpen();
		}
		onkeydown(e) {
			if (this.opts.disabled.current) return;
			if (!(e.key === "Enter" || e.key === " ")) return;
			e.preventDefault();
			this.#clearAllTimeouts();
			this.root.toggleOpen();
		}
		#getAriaControls() {
			if (this.root.opts.open.current && this.root.contentNode?.id) return this.root.contentNode?.id;
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			"aria-haspopup": "dialog",
			"aria-expanded": boolToStr(this.root.opts.open.current),
			"data-state": getDataOpenClosed(this.root.opts.open.current),
			"aria-controls": this.#getAriaControls(),
			[popoverAttrs.trigger]: "",
			disabled: this.opts.disabled.current,
			onkeydown: this.onkeydown,
			onclick: this.onclick,
			onpointerenter: this.onpointerenter,
			onpointerleave: this.onpointerleave,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var PopoverContentState = class PopoverContentState {
		static create(opts) {
			return new PopoverContentState(opts, PopoverRootContext.get());
		}
		opts;
		root;
		attachment;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(this.opts.ref, (v) => this.root.contentNode = v);
			this.onpointerdown = this.onpointerdown.bind(this);
			this.onfocusin = this.onfocusin.bind(this);
			this.onpointerenter = this.onpointerenter.bind(this);
			this.onpointerleave = this.onpointerleave.bind(this);
			new SafePolygon({
				triggerNode: () => this.root.triggerNode,
				contentNode: () => this.root.contentNode,
				enabled: () => this.root.opts.open.current && this.root.openedViaHover && !this.root.hasInteractedWithContent,
				onPointerExit: () => {
					this.root.handleDelayedHoverClose();
				}
			});
		}
		onpointerdown(_) {
			this.root.markInteraction();
		}
		onfocusin(e) {
			const target = e.target;
			if (isElement$1(target) && isTabbable(target)) this.root.markInteraction();
		}
		onpointerenter(e) {
			if (isTouch(e)) return;
			this.root.cancelDelayedClose();
		}
		onpointerleave(e) {
			if (isTouch(e)) return;
		}
		onInteractOutside = (e) => {
			this.opts.onInteractOutside.current(e);
			if (e.defaultPrevented) return;
			if (!isElement$1(e.target)) return;
			const closestTrigger = e.target.closest(popoverAttrs.selector("trigger"));
			if (closestTrigger && closestTrigger === this.root.triggerNode) return;
			if (this.opts.customAnchor.current) {
				if (isElement$1(this.opts.customAnchor.current)) {
					if (this.opts.customAnchor.current.contains(e.target)) return;
				} else if (typeof this.opts.customAnchor.current === "string") {
					const el = document.querySelector(this.opts.customAnchor.current);
					if (el && el.contains(e.target)) return;
				}
			}
			this.root.handleClose();
		};
		onEscapeKeydown = (e) => {
			this.opts.onEscapeKeydown.current(e);
			if (e.defaultPrevented) return;
			this.root.handleClose();
		};
		get shouldRender() {
			return this.root.contentPresence.shouldRender;
		}
		get shouldTrapFocus() {
			if (this.root.openedViaHover && !this.root.hasInteractedWithContent) return false;
			return true;
		}
		#snippetProps = /* @__PURE__ */ user_derived(() => ({ open: this.root.opts.open.current }));
		get snippetProps() {
			return get$2(this.#snippetProps);
		}
		set snippetProps(value) {
			set(this.#snippetProps, value);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			tabindex: -1,
			"data-state": getDataOpenClosed(this.root.opts.open.current),
			...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
			[popoverAttrs.content]: "",
			style: {
				pointerEvents: "auto",
				contain: "layout style"
			},
			onpointerdown: this.onpointerdown,
			onfocusin: this.onfocusin,
			onpointerenter: this.onpointerenter,
			onpointerleave: this.onpointerleave,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
		popperProps = {
			onInteractOutside: this.onInteractOutside,
			onEscapeKeydown: this.onEscapeKeydown
		};
	};
	var PopoverCloseState = class PopoverCloseState {
		static create(opts) {
			return new PopoverCloseState(opts, PopoverRootContext.get());
		}
		opts;
		root;
		attachment;
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(this.opts.ref);
			this.onclick = this.onclick.bind(this);
			this.onkeydown = this.onkeydown.bind(this);
		}
		onclick(_) {
			this.root.handleClose();
		}
		onkeydown(e) {
			if (!(e.key === "Enter" || e.key === " ")) return;
			e.preventDefault();
			this.root.handleClose();
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			onclick: this.onclick,
			onkeydown: this.onkeydown,
			type: "button",
			[popoverAttrs.close]: "",
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	//#endregion
	//#region node_modules/bits-ui/dist/bits/popover/components/popover-content.svelte
	var rest_excludes$21 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"child",
		"children",
		"ref",
		"id",
		"forceMount",
		"onOpenAutoFocus",
		"onCloseAutoFocus",
		"onEscapeKeydown",
		"onInteractOutside",
		"trapFocus",
		"preventScroll",
		"customAnchor",
		"style"
	]);
	var root$26 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		[
			"div",
			null,
			,
		]
	]]);
	var root_1$13 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		[
			"div",
			null,
			,
		]
	]]);
	function Popover_content($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let ref = prop($$props, "ref", 15, null), id = prop($$props, "id", 19, () => createId(uid)), forceMount = prop($$props, "forceMount", 3, false), onOpenAutoFocus = prop($$props, "onOpenAutoFocus", 3, noop), onCloseAutoFocus = prop($$props, "onCloseAutoFocus", 3, noop), onEscapeKeydown = prop($$props, "onEscapeKeydown", 3, noop), onInteractOutside = prop($$props, "onInteractOutside", 3, noop), trapFocus = prop($$props, "trapFocus", 3, true), preventScroll = prop($$props, "preventScroll", 3, false), customAnchor = prop($$props, "customAnchor", 3, null), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$21);
		const contentState = PopoverContentState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v)),
			onInteractOutside: boxWith(() => onInteractOutside()),
			onEscapeKeydown: boxWith(() => onEscapeKeydown()),
			customAnchor: boxWith(() => customAnchor())
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, contentState.props));
		const effectiveTrapFocus = /* @__PURE__ */ user_derived(() => trapFocus() && contentState.shouldTrapFocus);
		function handleOpenAutoFocus(e) {
			if (!contentState.shouldTrapFocus) e.preventDefault();
			onOpenAutoFocus()(e);
		}
		var fragment = comment();
		var node = first_child(fragment);
		var consequent_1 = ($$anchor) => {
			{
				const popper = ($$anchor, $$arg0) => {
					let props = () => ($$arg0?.()).props;
					let wrapperProps = () => ($$arg0?.()).wrapperProps;
					const finalProps = /* @__PURE__ */ user_derived(() => mergeProps(props(), { style: getFloatingContentCSSVars("popover") }, { style: $$props.style }));
					var fragment_2 = comment();
					var node_1 = first_child(fragment_2);
					var consequent = ($$anchor) => {
						var fragment_3 = comment();
						var node_2 = first_child(fragment_3);
						{
							let $0 = /* @__PURE__ */ user_derived(() => ({
								props: get$2(finalProps),
								wrapperProps: wrapperProps(),
								...contentState.snippetProps
							}));
							snippet(node_2, () => $$props.child, () => get$2($0));
						}
						append($$anchor, fragment_3);
					};
					var alternate = ($$anchor) => {
						var div = root$26();
						attribute_effect(div, () => ({ ...wrapperProps() }));
						var div_1 = child(div);
						attribute_effect(div_1, () => ({ ...get$2(finalProps) }));
						snippet(child(div_1), () => $$props.children ?? noop$1);
						reset(div_1);
						reset(div);
						append($$anchor, div);
					};
					if_block(node_1, ($$render) => {
						if ($$props.child) $$render(consequent);
						else $$render(alternate, -1);
					});
					append($$anchor, fragment_2);
				};
				Popper_layer_force_mount($$anchor, spread_props(() => get$2(mergedProps), () => contentState.popperProps, {
					get ref() {
						return contentState.opts.ref;
					},
					get enabled() {
						return contentState.root.opts.open.current;
					},
					get id() {
						return id();
					},
					get trapFocus() {
						return get$2(effectiveTrapFocus);
					},
					get preventScroll() {
						return preventScroll();
					},
					loop: true,
					forceMount: true,
					get customAnchor() {
						return customAnchor();
					},
					onOpenAutoFocus: handleOpenAutoFocus,
					get onCloseAutoFocus() {
						return onCloseAutoFocus();
					},
					get shouldRender() {
						return contentState.shouldRender;
					},
					popper,
					$$slots: { popper: true }
				}));
			}
		};
		var consequent_3 = ($$anchor) => {
			{
				const popper = ($$anchor, $$arg0) => {
					let props = () => ($$arg0?.()).props;
					let wrapperProps = () => ($$arg0?.()).wrapperProps;
					const finalProps = /* @__PURE__ */ user_derived(() => mergeProps(props(), { style: getFloatingContentCSSVars("popover") }, { style: $$props.style }));
					var fragment_5 = comment();
					var node_4 = first_child(fragment_5);
					var consequent_2 = ($$anchor) => {
						var fragment_6 = comment();
						var node_5 = first_child(fragment_6);
						{
							let $0 = /* @__PURE__ */ user_derived(() => ({
								props: get$2(finalProps),
								wrapperProps: wrapperProps(),
								...contentState.snippetProps
							}));
							snippet(node_5, () => $$props.child, () => get$2($0));
						}
						append($$anchor, fragment_6);
					};
					var alternate_1 = ($$anchor) => {
						var div_2 = root_1$13();
						attribute_effect(div_2, () => ({ ...wrapperProps() }));
						var div_3 = child(div_2);
						attribute_effect(div_3, () => ({ ...get$2(finalProps) }));
						snippet(child(div_3), () => $$props.children ?? noop$1);
						reset(div_3);
						reset(div_2);
						append($$anchor, div_2);
					};
					if_block(node_4, ($$render) => {
						if ($$props.child) $$render(consequent_2);
						else $$render(alternate_1, -1);
					});
					append($$anchor, fragment_5);
				};
				Popper_layer($$anchor, spread_props(() => get$2(mergedProps), () => contentState.popperProps, {
					get ref() {
						return contentState.opts.ref;
					},
					get open() {
						return contentState.root.opts.open.current;
					},
					get id() {
						return id();
					},
					get trapFocus() {
						return get$2(effectiveTrapFocus);
					},
					get preventScroll() {
						return preventScroll();
					},
					loop: true,
					forceMount: false,
					get customAnchor() {
						return customAnchor();
					},
					onOpenAutoFocus: handleOpenAutoFocus,
					get onCloseAutoFocus() {
						return onCloseAutoFocus();
					},
					get shouldRender() {
						return contentState.shouldRender;
					},
					popper,
					$$slots: { popper: true }
				}));
			}
		};
		if_block(node, ($$render) => {
			if (forceMount()) $$render(consequent_1);
			else if (!forceMount()) $$render(consequent_3, 1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/popover/components/popover-trigger.svelte
	var rest_excludes$20 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"children",
		"child",
		"id",
		"ref",
		"type",
		"disabled",
		"openOnHover",
		"openDelay",
		"closeDelay"
	]);
	var root$25 = /* @__PURE__ */ from_tree([[
		"button",
		null,
		,
	]]);
	function Popover_trigger($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), type = prop($$props, "type", 3, "button"), disabled = prop($$props, "disabled", 3, false), openOnHover = prop($$props, "openOnHover", 3, false), openDelay = prop($$props, "openDelay", 3, 700), closeDelay = prop($$props, "closeDelay", 3, 300), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$20);
		const triggerState = PopoverTriggerState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v)),
			disabled: boxWith(() => Boolean(disabled())),
			openOnHover: boxWith(() => openOnHover()),
			openDelay: boxWith(() => openDelay()),
			closeDelay: boxWith(() => closeDelay())
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, triggerState.props, { type: type() }));
		Floating_layer_anchor($$anchor, {
			get id() {
				return id();
			},
			get ref() {
				return triggerState.opts.ref;
			},
			children: ($$anchor, $$slotProps) => {
				var fragment_1 = comment();
				var node = first_child(fragment_1);
				var consequent = ($$anchor) => {
					var fragment_2 = comment();
					snippet(first_child(fragment_2), () => $$props.child, () => ({ props: get$2(mergedProps) }));
					append($$anchor, fragment_2);
				};
				var alternate = ($$anchor) => {
					var button = root$25();
					attribute_effect(button, () => ({ ...get$2(mergedProps) }));
					snippet(child(button), () => $$props.children ?? noop$1);
					reset(button);
					append($$anchor, button);
				};
				if_block(node, ($$render) => {
					if ($$props.child) $$render(consequent);
					else $$render(alternate, -1);
				});
				append($$anchor, fragment_1);
			},
			$$slots: { default: true }
		});
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/popover/components/popover-close.svelte
	var rest_excludes$19 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"child",
		"children",
		"id",
		"ref"
	]);
	var root$24 = /* @__PURE__ */ from_tree([[
		"button",
		null,
		,
	]]);
	function Popover_close($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$19);
		const closeState = PopoverCloseState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, closeState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var button = root$24();
			attribute_effect(button, () => ({ ...get$2(mergedProps) }));
			snippet(child(button), () => $$props.children ?? noop$1);
			reset(button);
			append($$anchor, button);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/popover/components/popover.svelte
	function Popover($$anchor, $$props) {
		push($$props, true);
		let open = prop($$props, "open", 15, false), onOpenChange = prop($$props, "onOpenChange", 3, noop), onOpenChangeComplete = prop($$props, "onOpenChangeComplete", 3, noop);
		PopoverRootState.create({
			open: boxWith(() => open(), (v) => {
				open(v);
				onOpenChange()(v);
			}),
			onOpenChangeComplete: boxWith(() => onOpenChangeComplete())
		});
		Floating_layer($$anchor, {
			children: ($$anchor, $$slotProps) => {
				var fragment_1 = comment();
				snippet(first_child(fragment_1), () => $$props.children ?? noop$1);
				append($$anchor, fragment_1);
			},
			$$slots: { default: true }
		});
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select.svelte
	var root$23 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	function Select($$anchor, $$props) {
		push($$props, true);
		let value = prop($$props, "value", 15), onValueChange = prop($$props, "onValueChange", 3, noop), name = prop($$props, "name", 3, ""), disabled = prop($$props, "disabled", 3, false), open = prop($$props, "open", 15, false), onOpenChange = prop($$props, "onOpenChange", 3, noop), onOpenChangeComplete = prop($$props, "onOpenChangeComplete", 3, noop), loop = prop($$props, "loop", 3, false), scrollAlignment = prop($$props, "scrollAlignment", 3, "nearest"), required = prop($$props, "required", 3, false), items = prop($$props, "items", 19, () => []), allowDeselect = prop($$props, "allowDeselect", 3, false);
		function handleDefaultValue() {
			if (value() !== void 0) return;
			value($$props.type === "single" ? "" : []);
		}
		handleDefaultValue();
		watch.pre(() => value(), () => {
			handleDefaultValue();
		});
		let inputValue = /* @__PURE__ */ state("");
		const rootState = SelectRootState.create({
			type: $$props.type,
			value: boxWith(() => value(), (v) => {
				value(v);
				onValueChange()(v);
			}),
			disabled: boxWith(() => disabled()),
			required: boxWith(() => required()),
			open: boxWith(() => open(), (v) => {
				open(v);
				onOpenChange()(v);
			}),
			loop: boxWith(() => loop()),
			scrollAlignment: boxWith(() => scrollAlignment()),
			name: boxWith(() => name()),
			isCombobox: false,
			items: boxWith(() => items()),
			allowDeselect: boxWith(() => allowDeselect()),
			inputValue: boxWith(() => get$2(inputValue), (v) => set(inputValue, v, true)),
			onOpenChangeComplete: boxWith(() => onOpenChangeComplete())
		});
		var fragment = root$23();
		var node = first_child(fragment);
		Floating_layer(node, {
			children: ($$anchor, $$slotProps) => {
				var fragment_1 = comment();
				snippet(first_child(fragment_1), () => $$props.children ?? noop$1);
				append($$anchor, fragment_1);
			},
			$$slots: { default: true }
		});
		var node_2 = sibling(node, 2);
		var consequent_1 = ($$anchor) => {
			var fragment_2 = comment();
			var node_3 = first_child(fragment_2);
			var consequent = ($$anchor) => {
				Select_hidden_input($$anchor, { get autocomplete() {
					return $$props.autocomplete;
				} });
			};
			var alternate = ($$anchor) => {
				var fragment_4 = comment();
				each(first_child(fragment_4), 16, () => rootState.opts.value.current, (item) => item, ($$anchor, item) => {
					Select_hidden_input($$anchor, {
						get value() {
							return item;
						},
						get autocomplete() {
							return $$props.autocomplete;
						}
					});
				});
				append($$anchor, fragment_4);
			};
			if_block(node_3, ($$render) => {
				if (rootState.opts.value.current.length === 0) $$render(consequent);
				else $$render(alternate, -1);
			});
			append($$anchor, fragment_2);
		};
		var d = /* @__PURE__ */ user_derived(() => Array.isArray(rootState.opts.value.current));
		var alternate_1 = ($$anchor) => {
			Select_hidden_input($$anchor, {
				get autocomplete() {
					return $$props.autocomplete;
				},
				get value() {
					return rootState.opts.value.current;
				},
				set value($$value) {
					rootState.opts.value.current = $$value;
				}
			});
		};
		if_block(node_2, ($$render) => {
			if (get$2(d)) $$render(consequent_1);
			else $$render(alternate_1, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select-value.svelte
	var rest_excludes$18 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"ref",
		"id",
		"placeholder",
		"child",
		"children"
	]);
	var root$22 = /* @__PURE__ */ from_tree([[
		"span",
		null,
		,
	]]);
	function Select_value($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let ref = prop($$props, "ref", 15, null), id = prop($$props, "id", 19, () => createId(uid)), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$18);
		const valueState = SelectValueState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v)),
			placeholder: boxWith(() => $$props.placeholder)
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, valueState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			var node_1 = first_child(fragment_1);
			{
				let $0 = /* @__PURE__ */ user_derived(() => ({
					props: get$2(mergedProps),
					...valueState.snippetProps
				}));
				snippet(node_1, () => $$props.child, () => get$2($0));
			}
			append($$anchor, fragment_1);
		};
		var alternate_1 = ($$anchor) => {
			var span = root$22();
			attribute_effect(span, () => ({ ...get$2(mergedProps) }));
			var node_2 = child(span);
			var consequent_1 = ($$anchor) => {
				var fragment_2 = comment();
				snippet(first_child(fragment_2), () => $$props.children ?? noop$1, () => valueState.snippetProps);
				append($$anchor, fragment_2);
			};
			var consequent_2 = ($$anchor) => {
				var text$3 = text();
				template_effect(() => set_text(text$3, valueState.snippetProps.selection.selected?.label ?? $$props.placeholder));
				append($$anchor, text$3);
			};
			var consequent_3 = ($$anchor) => {
				var text_1 = text();
				template_effect(($0) => set_text(text_1, $0), [() => valueState.snippetProps.selection.selected.length > 0 ? valueState.snippetProps.selection.selected.map((selected) => selected.label).join(", ") : $$props.placeholder]);
				append($$anchor, text_1);
			};
			var alternate = ($$anchor) => {
				var text_2 = text();
				template_effect(() => set_text(text_2, $$props.placeholder));
				append($$anchor, text_2);
			};
			if_block(node_2, ($$render) => {
				if ($$props.children) $$render(consequent_1);
				else if (valueState.snippetProps.selection.type === "single") $$render(consequent_2, 1);
				else if (valueState.snippetProps.selection.type === "multiple" && valueState.snippetProps.selection.selected) $$render(consequent_3, 2);
				else $$render(alternate, -1);
			});
			reset(span);
			append($$anchor, span);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate_1, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/select/components/select-trigger.svelte
	var rest_excludes$17 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"child",
		"children",
		"type"
	]);
	var root$21 = /* @__PURE__ */ from_tree([[
		"button",
		null,
		,
	]]);
	function Select_trigger($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), type = prop($$props, "type", 3, "button"), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$17);
		const triggerState = SelectTriggerState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, triggerState.props, { type: type() }));
		var fragment = comment();
		component(first_child(fragment), () => Floating_layer_anchor, ($$anchor, FloatingLayer_Anchor) => {
			FloatingLayer_Anchor($$anchor, {
				get id() {
					return id();
				},
				get ref() {
					return triggerState.opts.ref;
				},
				children: ($$anchor, $$slotProps) => {
					var fragment_1 = comment();
					var node_1 = first_child(fragment_1);
					var consequent = ($$anchor) => {
						var fragment_2 = comment();
						snippet(first_child(fragment_2), () => $$props.child, () => ({ props: get$2(mergedProps) }));
						append($$anchor, fragment_2);
					};
					var alternate = ($$anchor) => {
						var button = root$21();
						attribute_effect(button, () => ({ ...get$2(mergedProps) }));
						snippet(child(button), () => $$props.children ?? noop$1);
						reset(button);
						append($$anchor, button);
					};
					if_block(node_1, ($$render) => {
						if ($$props.child) $$render(consequent);
						else $$render(alternate, -1);
					});
					append($$anchor, fragment_1);
				},
				$$slots: { default: true }
			});
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/tabs/tabs.svelte.js
	var tabsAttrs = createBitsAttrs({
		component: "tabs",
		parts: [
			"root",
			"list",
			"trigger",
			"content"
		]
	});
	var TabsRootContext = new Context("Tabs.Root");
	var TabsRootState = class TabsRootState {
		static create(opts) {
			return TabsRootContext.set(new TabsRootState(opts));
		}
		opts;
		attachment;
		rovingFocusGroup;
		#triggerIds = /* @__PURE__ */ state(proxy([]));
		get triggerIds() {
			return get$2(this.#triggerIds);
		}
		set triggerIds(value) {
			set(this.#triggerIds, value, true);
		}
		valueToTriggerId = new SvelteMap();
		valueToContentId = new SvelteMap();
		constructor(opts) {
			this.opts = opts;
			this.attachment = attachRef(opts.ref);
			this.rovingFocusGroup = new RovingFocusGroup({
				candidateAttr: tabsAttrs.trigger,
				rootNode: this.opts.ref,
				loop: this.opts.loop,
				orientation: this.opts.orientation
			});
		}
		registerTrigger(id, value) {
			this.triggerIds.push(id);
			this.valueToTriggerId.set(value, id);
			return () => {
				this.triggerIds = this.triggerIds.filter((triggerId) => triggerId !== id);
				this.valueToTriggerId.delete(value);
			};
		}
		registerContent(id, value) {
			this.valueToContentId.set(value, id);
			return () => {
				this.valueToContentId.delete(value);
			};
		}
		setValue(v) {
			this.opts.value.current = v;
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			"data-orientation": this.opts.orientation.current,
			[tabsAttrs.root]: "",
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var TabsListState = class TabsListState {
		static create(opts) {
			return new TabsListState(opts, TabsRootContext.get());
		}
		opts;
		root;
		attachment;
		#isDisabled = /* @__PURE__ */ user_derived(() => this.root.opts.disabled.current);
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "tablist",
			"aria-orientation": this.root.opts.orientation.current,
			"data-orientation": this.root.opts.orientation.current,
			[tabsAttrs.list]: "",
			"data-disabled": boolToEmptyStrOrUndef(get$2(this.#isDisabled)),
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var TabsTriggerState = class TabsTriggerState {
		static create(opts) {
			return new TabsTriggerState(opts, TabsRootContext.get());
		}
		opts;
		root;
		attachment;
		#tabIndex = /* @__PURE__ */ state(0);
		#isActive = /* @__PURE__ */ user_derived(() => this.root.opts.value.current === this.opts.value.current);
		#isDisabled = /* @__PURE__ */ user_derived(() => this.opts.disabled.current || this.root.opts.disabled.current);
		#ariaControls = /* @__PURE__ */ user_derived(() => this.root.valueToContentId.get(this.opts.value.current));
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref);
			watch([() => this.opts.id.current, () => this.opts.value.current], ([id, value]) => {
				return this.root.registerTrigger(id, value);
			});
			user_effect(() => {
				this.root.triggerIds.length;
				if (get$2(this.#isActive) || !this.root.opts.value.current) set(this.#tabIndex, 0);
				else set(this.#tabIndex, -1);
			});
			this.onfocus = this.onfocus.bind(this);
			this.onclick = this.onclick.bind(this);
			this.onkeydown = this.onkeydown.bind(this);
		}
		#activate() {
			if (this.root.opts.value.current === this.opts.value.current) return;
			this.root.setValue(this.opts.value.current);
		}
		onfocus(_) {
			if (this.root.opts.activationMode.current !== "automatic" || get$2(this.#isDisabled)) return;
			this.#activate();
		}
		onclick(_) {
			if (get$2(this.#isDisabled)) return;
			this.#activate();
		}
		onkeydown(e) {
			if (get$2(this.#isDisabled)) return;
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				this.#activate();
				return;
			}
			this.root.rovingFocusGroup.handleKeydown(this.opts.ref.current, e);
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "tab",
			"data-state": getTabDataState(get$2(this.#isActive)),
			"data-value": this.opts.value.current,
			"data-orientation": this.root.opts.orientation.current,
			"data-disabled": boolToEmptyStrOrUndef(get$2(this.#isDisabled)),
			"aria-selected": boolToStr(get$2(this.#isActive)),
			"aria-controls": get$2(this.#ariaControls),
			[tabsAttrs.trigger]: "",
			disabled: boolToTrueOrUndef(get$2(this.#isDisabled)),
			tabindex: get$2(this.#tabIndex),
			onclick: this.onclick,
			onfocus: this.onfocus,
			onkeydown: this.onkeydown,
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	var TabsContentState = class TabsContentState {
		static create(opts) {
			return new TabsContentState(opts, TabsRootContext.get());
		}
		opts;
		root;
		attachment;
		#isActive = /* @__PURE__ */ user_derived(() => this.root.opts.value.current === this.opts.value.current);
		#ariaLabelledBy = /* @__PURE__ */ user_derived(() => this.root.valueToTriggerId.get(this.opts.value.current));
		constructor(opts, root) {
			this.opts = opts;
			this.root = root;
			this.attachment = attachRef(opts.ref);
			watch([() => this.opts.id.current, () => this.opts.value.current], ([id, value]) => {
				return this.root.registerContent(id, value);
			});
		}
		#props = /* @__PURE__ */ user_derived(() => ({
			id: this.opts.id.current,
			role: "tabpanel",
			hidden: boolToTrueOrUndef(!get$2(this.#isActive)),
			tabindex: this.opts.tabindex.current,
			"data-value": this.opts.value.current,
			"data-state": getTabDataState(get$2(this.#isActive)),
			"aria-labelledby": get$2(this.#ariaLabelledBy),
			"data-orientation": this.root.opts.orientation.current,
			[tabsAttrs.content]: "",
			...this.attachment
		}));
		get props() {
			return get$2(this.#props);
		}
		set props(value) {
			set(this.#props, value);
		}
	};
	function getTabDataState(condition) {
		return condition ? "active" : "inactive";
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/tabs/components/tabs.svelte
	var rest_excludes$16 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"id",
		"ref",
		"value",
		"onValueChange",
		"orientation",
		"loop",
		"activationMode",
		"disabled",
		"children",
		"child"
	]);
	var root$20 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		,
	]]);
	function Tabs($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), value = prop($$props, "value", 15, ""), onValueChange = prop($$props, "onValueChange", 3, noop), orientation = prop($$props, "orientation", 3, "horizontal"), loop = prop($$props, "loop", 3, true), activationMode = prop($$props, "activationMode", 3, "automatic"), disabled = prop($$props, "disabled", 3, false), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$16);
		const rootState = TabsRootState.create({
			id: boxWith(() => id()),
			value: boxWith(() => value(), (v) => {
				value(v);
				onValueChange()(v);
			}),
			orientation: boxWith(() => orientation()),
			loop: boxWith(() => loop()),
			activationMode: boxWith(() => activationMode()),
			disabled: boxWith(() => disabled()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, rootState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var div = root$20();
			attribute_effect(div, () => ({ ...get$2(mergedProps) }));
			snippet(child(div), () => $$props.children ?? noop$1);
			reset(div);
			append($$anchor, div);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/tabs/components/tabs-content.svelte
	var rest_excludes$15 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"children",
		"child",
		"id",
		"ref",
		"value",
		"tabindex"
	]);
	var root$19 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		,
	]]);
	function Tabs_content($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), tabindex = prop($$props, "tabindex", 3, 0), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$15);
		const contentState = TabsContentState.create({
			value: boxWith(() => $$props.value),
			tabindex: boxWith(() => tabindex() ?? 0),
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, contentState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var div = root$19();
			attribute_effect(div, () => ({ ...get$2(mergedProps) }));
			snippet(child(div), () => $$props.children ?? noop$1);
			reset(div);
			append($$anchor, div);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/tabs/components/tabs-list.svelte
	var rest_excludes$14 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"child",
		"children",
		"id",
		"ref"
	]);
	var root$18 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		,
	]]);
	function Tabs_list($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let id = prop($$props, "id", 19, () => createId(uid)), ref = prop($$props, "ref", 15, null), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$14);
		const listState = TabsListState.create({
			id: boxWith(() => id()),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, listState.props));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var div = root$18();
			attribute_effect(div, () => ({ ...get$2(mergedProps) }));
			snippet(child(div), () => $$props.children ?? noop$1);
			reset(div);
			append($$anchor, div);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/bits-ui/dist/bits/tabs/components/tabs-trigger.svelte
	var rest_excludes$13 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"child",
		"children",
		"disabled",
		"id",
		"type",
		"value",
		"ref"
	]);
	var root$17 = /* @__PURE__ */ from_tree([[
		"button",
		null,
		,
	]]);
	function Tabs_trigger($$anchor, $$props) {
		const uid = props_id();
		push($$props, true);
		let disabled = prop($$props, "disabled", 3, false), id = prop($$props, "id", 19, () => createId(uid)), type = prop($$props, "type", 3, "button"), ref = prop($$props, "ref", 15, null), restProps = /* @__PURE__ */ rest_props($$props, rest_excludes$13);
		const triggerState = TabsTriggerState.create({
			id: boxWith(() => id()),
			disabled: boxWith(() => disabled() ?? false),
			value: boxWith(() => $$props.value),
			ref: boxWith(() => ref(), (v) => ref(v))
		});
		const mergedProps = /* @__PURE__ */ user_derived(() => mergeProps(restProps, triggerState.props, { type: type() }));
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var fragment_1 = comment();
			snippet(first_child(fragment_1), () => $$props.child, () => ({ props: get$2(mergedProps) }));
			append($$anchor, fragment_1);
		};
		var alternate = ($$anchor) => {
			var button = root$17();
			attribute_effect(button, () => ({ ...get$2(mergedProps) }));
			snippet(child(button), () => $$props.children ?? noop$1);
			reset(button);
			append($$anchor, button);
		};
		if_block(node, ($$render) => {
			if ($$props.child) $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/utils/defaultAttributes.js
	/**
	* @file
	* @license @lucide/svelte v1.47.0 - ISC
	*
	* This source code is licensed under the ISC license.
	* See the LICENSE file in the root directory of this source tree.
	*/
	var defaultAttributes = {
		xmlns: "http://www.w3.org/2000/svg",
		width: 24,
		height: 24,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": 2,
		"stroke-linecap": "round",
		"stroke-linejoin": "round"
	};
	//#endregion
	//#region node_modules/@lucide/svelte/dist/utils/mergeClasses.js
	/**
	* @file
	* @license @lucide/svelte v1.47.0 - ISC
	*
	* This source code is licensed under the ISC license.
	* See the LICENSE file in the root directory of this source tree.
	*/
	/**
	* Merges classes into a single string
	*
	* @param {array} classes
	* @returns {string} A string of classes
	*/
	var mergeClasses = (...classes) => classes.filter((className, index, array) => {
		return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
	}).join(" ").trim();
	//#endregion
	//#region node_modules/@lucide/svelte/dist/utils/buildLucideIconNode.js
	/**
	* @file
	* @license @lucide/svelte v1.47.0 - ISC
	*
	* This source code is licensed under the ISC license.
	* See the LICENSE file in the root directory of this source tree.
	*/
	function isDefined(value) {
		return value !== null && value !== void 0;
	}
	/**
	* Creates a Lucide icon node (an svgson-like format) from a Lucide icon object.
	*
	* @param icon The icon to build.
	* @param params Additional build parameters.
	*/
	function buildLucideIconNode(icon, params = {}) {
		const attributeNames = params.attributeNames ?? {};
		const getAttributeName = (attributeName) => attributeNames[attributeName] ?? attributeName;
		const viewBoxWidth = icon.size ?? icon.width ?? defaultAttributes["width"];
		const viewBoxHeight = icon.size ?? icon.height ?? defaultAttributes["height"];
		const aliasClassNames = icon.aliases?.filter((alias) => typeof alias === "string" && alias.trim() !== "").map((alias) => `lucide-${alias}`) ?? [];
		const iconClassNames = [...icon.name ? [`lucide-${icon.name}`] : [], ...aliasClassNames];
		const classNamesFromClassName = params.className?.split(" ").filter(Boolean) ?? [];
		const className = params.includeDefaultClasses === false ? mergeClasses(...classNamesFromClassName) : mergeClasses("lucide", ...iconClassNames, ...classNamesFromClassName);
		const calculatedStrokeWidth = params.absoluteStrokeWidth ? Number(params.strokeWidth ?? defaultAttributes["stroke-width"]) * Number(icon.size ?? icon.width ?? defaultAttributes["width"]) / Number(params.size ?? params.width ?? defaultAttributes["width"]) : params.strokeWidth ?? defaultAttributes["stroke-width"];
		return [
			"svg",
			{
				...Object.entries(defaultAttributes).reduce((attrs, [attrName, value]) => {
					attrs[getAttributeName(attrName)] = value;
					return attrs;
				}, {}),
				..."color" in params && params.color && { [getAttributeName("stroke")]: params.color },
				..."size" in params && isDefined(params.size) && {
					[getAttributeName("width")]: params.size,
					[getAttributeName("height")]: params.size
				},
				..."width" in params && isDefined(params.width) && { [getAttributeName("width")]: params.width },
				..."height" in params && isDefined(params.height) && { [getAttributeName("height")]: params.height },
				[getAttributeName("stroke-width")]: calculatedStrokeWidth,
				...className && { [getAttributeName("class")]: className },
				[getAttributeName("viewBox")]: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
				...params.hasA11yProp === false ? { [getAttributeName("aria-hidden")]: "true" } : {},
				..."attributes" in params && params.attributes
			},
			icon.node.map((child) => {
				const [name, attrs, children] = child;
				const nextAttrs = params.nonScalingStroke ? {
					[getAttributeName("vector-effect")]: "non-scaling-stroke",
					...attrs
				} : attrs;
				return children ? [
					name,
					nextAttrs,
					children
				] : [name, nextAttrs];
			})
		];
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/utils/hasA11yProp.js
	/**
	* @file
	* @license @lucide/svelte v1.47.0 - ISC
	*
	* This source code is licensed under the ISC license.
	* See the LICENSE file in the root directory of this source tree.
	*/
	/**
	* Check if a component has an accessibility prop
	*
	* @param {object} props
	* @returns {boolean} Whether the component has an accessibility prop
	*/
	var hasA11yProp = (props) => {
		for (const prop in props) if (prop.startsWith("aria-") || prop === "role" || prop === "title") return true;
		return false;
	};
	//#endregion
	//#region node_modules/@lucide/svelte/dist/context.js
	/**
	* @file
	* @license @lucide/svelte v1.47.0 - ISC
	*
	* This source code is licensed under the ISC license.
	* See the LICENSE file in the root directory of this source tree.
	*/
	var LucideContext = Symbol("lucide-context");
	var getLucideContext = () => getContext(LucideContext);
	//#endregion
	//#region node_modules/@lucide/svelte/dist/Icon.svelte
	var rest_excludes$12 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy",
		"color",
		"size",
		"width",
		"height",
		"strokeWidth",
		"absoluteStrokeWidth",
		"nonScalingStroke",
		"iconNode",
		"icon",
		"class",
		"children"
	]);
	var root$16 = /* @__PURE__ */ from_tree([[
		"svg",
		null,
		,
		,
	]], 4);
	function Icon($$anchor, $$props) {
		push($$props, true);
		const globalProps = getLucideContext() ?? {};
		const color = prop($$props, "color", 19, () => globalProps.color ?? "currentColor"), size = prop($$props, "size", 19, () => globalProps.size ?? 24), width = prop($$props, "width", 19, size), height = prop($$props, "height", 19, size), strokeWidth = prop($$props, "strokeWidth", 19, () => globalProps.strokeWidth ?? 2), absoluteStrokeWidth = prop($$props, "absoluteStrokeWidth", 19, () => globalProps.absoluteStrokeWidth ?? false), nonScalingStroke = prop($$props, "nonScalingStroke", 19, () => globalProps.nonScalingStroke ?? false), iconNode = prop($$props, "iconNode", 19, () => []), icon = prop($$props, "icon", 19, () => ({
			node: iconNode(),
			aliases: [],
			size: 24
		})), props = /* @__PURE__ */ rest_props($$props, rest_excludes$12);
		const hasAccessibleProp = /* @__PURE__ */ user_derived(() => Boolean($$props.children) || hasA11yProp(props));
		const $$d = /* @__PURE__ */ user_derived(() => buildLucideIconNode(icon(), {
			color: color(),
			width: width(),
			height: height(),
			strokeWidth: strokeWidth(),
			absoluteStrokeWidth: absoluteStrokeWidth(),
			nonScalingStroke: nonScalingStroke(),
			className: mergeClasses("lucide-icon", globalProps.class),
			hasA11yProp: get$2(hasAccessibleProp),
			attributes: props
		})), $$array = /* @__PURE__ */ user_derived(() => to_array(get$2($$d), 3)), svgAttributes = /* @__PURE__ */ user_derived(() => get$2($$array)[1]), builtIconNode = /* @__PURE__ */ user_derived(() => fallback(get$2($$array)[2], () => [], true));
		const iconAttributes = /* @__PURE__ */ user_derived(() => ({
			...get$2(svgAttributes),
			class: [...get$2(svgAttributes).class.split(" "), $$props.class]
		}));
		var svg = root$16();
		attribute_effect(svg, () => ({ ...get$2(iconAttributes) }));
		var node = child(svg);
		each(node, 17, () => get$2(builtIconNode), index$1, ($$anchor, $$item) => {
			var $$array_1 = /* @__PURE__ */ user_derived(() => to_array(get$2($$item), 2));
			let tag = () => get$2($$array_1)[0];
			let attrs = () => get$2($$array_1)[1];
			var fragment = comment();
			element$1(first_child(fragment), tag, true, ($$element, $$anchor) => {
				attribute_effect($$element, () => ({ ...attrs() }));
			});
			append($$anchor, fragment);
		});
		snippet(sibling(node), () => $$props.children ?? noop$1);
		reset(svg);
		append($$anchor, svg);
		pop();
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/arrow-left.svelte
	var rest_excludes$11 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Arrow_left($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$11);
		const iconData = {
			"name": "arrow-left",
			"size": 24,
			"node": [["path", { "d": "m12 19-7-7 7-7" }], ["path", { "d": "M19 12H5" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/check.svelte
	var rest_excludes$10 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Check($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$10);
		const iconData = {
			"name": "check",
			"size": 24,
			"node": [["path", { "d": "M20 6 9 17l-5-5" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/chevron-down.svelte
	var rest_excludes$9 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Chevron_down($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$9);
		const iconData = {
			"name": "chevron-down",
			"size": 24,
			"node": [["path", { "d": "m6 9 6 6 6-6" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/circle-question-mark.svelte
	var rest_excludes$8 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Circle_question_mark($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$8);
		const iconData = {
			"name": "circle-question-mark",
			"size": 24,
			"node": [
				["circle", {
					"cx": "12",
					"cy": "12",
					"r": "10"
				}],
				["path", { "d": "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }],
				["path", { "d": "M12 17h.01" }]
			],
			"aliases": ["help-circle", "circle-help"]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/download.svelte
	var rest_excludes$7 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Download($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$7);
		const iconData = {
			"name": "download",
			"size": 24,
			"node": [
				["path", { "d": "M12 15V3" }],
				["path", { "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
				["path", { "d": "m7 10 5 5 5-5" }]
			]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/flask-conical.svelte
	var rest_excludes$6 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Flask_conical($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$6);
		const iconData = {
			"name": "flask-conical",
			"size": 24,
			"node": [
				["path", { "d": "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" }],
				["path", { "d": "M6.453 15h11.094" }],
				["path", { "d": "M8.5 2h7" }]
			]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/gauge.svelte
	var rest_excludes$5 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Gauge($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$5);
		const iconData = {
			"name": "gauge",
			"size": 24,
			"node": [["path", { "d": "m12 14 4-4" }], ["path", { "d": "M3.34 19a10 10 0 1 1 17.32 0" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/hourglass.svelte
	var rest_excludes$4 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Hourglass($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$4);
		const iconData = {
			"name": "hourglass",
			"size": 24,
			"node": [
				["path", { "d": "M5 22h14" }],
				["path", { "d": "M5 2h14" }],
				["path", { "d": "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" }],
				["path", { "d": "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" }]
			]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/list-filter.svelte
	var rest_excludes$3 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function List_filter($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$3);
		const iconData = {
			"name": "list-filter",
			"size": 24,
			"node": [
				["path", { "d": "M2 5h20" }],
				["path", { "d": "M6 12h12" }],
				["path", { "d": "M9 19h6" }]
			]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/panel-right.svelte
	var rest_excludes$2 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Panel_right($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$2);
		const iconData = {
			"name": "panel-right",
			"size": 24,
			"node": [["rect", {
				"width": "18",
				"height": "18",
				"x": "3",
				"y": "3",
				"rx": "2"
			}], ["path", { "d": "M15 3v18" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/rotate-cw.svelte
	var rest_excludes$1 = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function Rotate_cw($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes$1);
		const iconData = {
			"name": "rotate-cw",
			"size": 24,
			"node": [["path", { "d": "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }], ["path", { "d": "M21 3v5h-5" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region node_modules/@lucide/svelte/dist/icons/x.svelte
	var rest_excludes = /* @__PURE__ */ new Set([
		"$$slots",
		"$$events",
		"$$legacy"
	]);
	function X($$anchor, $$props) {
		let props = /* @__PURE__ */ rest_props($$props, rest_excludes);
		const iconData = {
			"name": "x",
			"size": 24,
			"node": [["path", { "d": "M18 6 6 18" }], ["path", { "d": "m6 6 12 12" }]]
		};
		Icon($$anchor, spread_props(() => props, { get icon() {
			return iconData;
		} }));
	}
	//#endregion
	//#region userscript/src/ui/SheetCombobox.svelte
	var root$15 = /* @__PURE__ */ from_tree([[
		"span",
		null,
		" "
	], ,], 1);
	var root_1$12 = /* @__PURE__ */ from_tree([[
		"div",
		{
			class: "combobox-empty",
			role: "status"
		},
		"Листы не найдены"
	]]);
	var root_2$11 = /* @__PURE__ */ from_tree([
		[
			"div",
			{ class: "sheet-combobox" },
			,
			" ",
			,
		],
		" ",
		,
	], 1);
	function SheetCombobox($$anchor, $$props) {
		push($$props, true);
		let model = prop($$props, "model", 7);
		let items = /* @__PURE__ */ user_derived(() => [...model().sheets, {
			value: "all",
			label: "Вся таблица"
		}]);
		let search = /* @__PURE__ */ state(null);
		let open = /* @__PURE__ */ state(false);
		let query = /* @__PURE__ */ user_derived(() => get$2(search)?.trim().toLocaleLowerCase("ru-RU") ?? "");
		let filtered = /* @__PURE__ */ user_derived(() => get$2(items).filter((item) => item.label.toLocaleLowerCase("ru-RU").includes(get$2(query))));
		function changeOpen(next) {
			set(open, next, true);
			if (!next) set(search, null);
		}
		var fragment = comment();
		var node = first_child(fragment);
		{
			let $0 = /* @__PURE__ */ user_derived(() => get$2(search) ?? model().sheetName(model().sheet));
			component(node, () => Combobox, ($$anchor, Combobox_Root) => {
				Combobox_Root($$anchor, {
					type: "single",
					get value() {
						return model().sheet;
					},
					onValueChange: (value) => {
						if (value) model().sheet = value;
					},
					get open() {
						return get$2(open);
					},
					onOpenChange: changeOpen,
					get inputValue() {
						return get$2($0);
					},
					get items() {
						return get$2(items);
					},
					allowDeselect: false,
					children: ($$anchor, $$slotProps) => {
						var fragment_1 = root_2$11();
						var div = first_child(fragment_1);
						var node_1 = child(div);
						component(node_1, () => Combobox_input, ($$anchor, Combobox_Input) => {
							Combobox_Input($$anchor, {
								class: "sheet-combobox-input",
								"aria-label": "Лист для расчёта",
								placeholder: "Найти лист…",
								oninput: (event) => {
									set(search, event.currentTarget.value, true);
								},
								onfocus: (event) => {
									event.currentTarget.select();
								}
							});
						});
						component(sibling(node_1, 2), () => Combobox_trigger, ($$anchor, Combobox_Trigger) => {
							Combobox_Trigger($$anchor, {
								class: "sheet-combobox-trigger",
								"aria-label": "Показать листы",
								children: ($$anchor, $$slotProps) => {
									Chevron_down($$anchor, { size: 14 });
								},
								$$slots: { default: true }
							});
						});
						reset(div);
						component(sibling(div, 2), () => Portal, ($$anchor, Combobox_Portal) => {
							Combobox_Portal($$anchor, {
								children: ($$anchor, $$slotProps) => {
									var fragment_3 = comment();
									component(first_child(fragment_3), () => Select_content, ($$anchor, Combobox_Content) => {
										Combobox_Content($$anchor, {
											class: "ui-select-menu sheet-combobox-menu",
											sideOffset: 6,
											align: "start",
											children: ($$anchor, $$slotProps) => {
												var fragment_4 = comment();
												component(first_child(fragment_4), () => Select_viewport, ($$anchor, Combobox_Viewport) => {
													Combobox_Viewport($$anchor, {
														class: "sheet-combobox-viewport",
														children: ($$anchor, $$slotProps) => {
															var fragment_5 = comment();
															each(first_child(fragment_5), 17, () => get$2(filtered), (item) => item.value, ($$anchor, item) => {
																var fragment_6 = comment();
																var node_7 = first_child(fragment_6);
																{
																	const children = ($$anchor, $$arg0) => {
																		let selected = () => ($$arg0?.()).selected;
																		var fragment_7 = root$15();
																		var span = first_child(fragment_7);
																		var text = only_child(span, true);
																		var node_8 = sibling(span);
																		var consequent = ($$anchor) => {
																			Check($$anchor, { size: 14 });
																		};
																		if_block(node_8, ($$render) => {
																			if (selected()) $$render(consequent);
																		});
																		template_effect(() => set_text(text, get$2(item).label));
																		append($$anchor, fragment_7);
																	};
																	component(node_7, () => Select_item, ($$anchor, Combobox_Item) => {
																		Combobox_Item($$anchor, {
																			get value() {
																				return get$2(item).value;
																			},
																			get label() {
																				return get$2(item).label;
																			},
																			class: "ui-select-item",
																			children,
																			$$slots: { default: true }
																		});
																	});
																}
																append($$anchor, fragment_6);
															}, ($$anchor) => {
																append($$anchor, root_1$12());
															});
															append($$anchor, fragment_5);
														},
														$$slots: { default: true }
													});
												});
												append($$anchor, fragment_4);
											},
											$$slots: { default: true }
										});
									});
									append($$anchor, fragment_3);
								},
								$$slots: { default: true }
							});
						});
						append($$anchor, fragment_1);
					},
					$$slots: { default: true }
				});
			});
		}
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/Controls.svelte
	var root$14 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "demo-disclosure" },
		"Макет с демо-данными."
	]]);
	var root_1$11 = /* @__PURE__ */ from_tree([
		[
			"p",
			null,
			"В списке могут быть не все ячейки. Время загрузки, расход памяти и время частей формулы недоступны."
		],
		" ",
		[
			"p",
			null,
			"Замеры до подключения скрипта не сохраняются."
		]
	], 1);
	var root_2$10 = /* @__PURE__ */ from_tree([[
		"button",
		{ class: "text-button" },
		"Выключить замеры в этой таблице"
	]]);
	var root_3$8 = /* @__PURE__ */ from_tree([
		[
			"div",
			{ class: "help-heading" },
			[
				"strong",
				null,
				"Об инструменте"
			],
			,
		],
		" ",
		[
			"p",
			{ class: "tool-origin" },
			"Расчёт и замеры выполняет Google. Иконка панели открывает штатный инструмент."
		],
		" ",
		,
		" ",
		["div", { class: "help-divider" }],
		" ",
		[
			"p",
			null,
			"«Пересчитать» — запускает расчёт выбранного листа; связанные листы тоже могут затронуться."
		],
		" ",
		[
			"p",
			null,
			"«Со связями» — показывает полученные замеры ячеек других листов."
		],
		" ",
		[
			"p",
			null,
			"Время ячейки — её самый долгий замер за период; повторы не складываются."
		],
		" ",
		[
			"p",
			null,
			"«С момента открытия» — замеры текущей сессии."
		],
		" ",
		,
		" ",
		[
			"div",
			{ class: "help-bottom" },
			[
				"button",
				{
					class: "text-button",
					title: "Скачать результаты"
				},
				,
				" Скачать данные"
			],
			" ",
			,
		]
	], 1);
	var root_4$6 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	var root_5$4 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "connection-notice" },
		[
			"span",
			null,
			"Для адресных замеров нужен ранний запуск."
		],
		[
			"button",
			{ class: "text-button" },
			"Подключить и перезагрузить"
		]
	]]);
	var root_6$4 = /* @__PURE__ */ from_tree([[
		"p",
		{
			class: "connection-notice",
			role: "status"
		},
		" "
	]]);
	var root_7$2 = /* @__PURE__ */ from_tree([
		[
			"div",
			{ class: "panel-toolbar" },
			,
			" ",
			,
		],
		" ",
		[
			"div",
			{ class: "panel-actions" },
			[
				"button",
				{ class: "primary-button" },
				,
				" "
			],
			" ",
			[
				"button",
				{
					class: "secondary-button google-panel-button",
					title: "Панель Google",
					"aria-label": "Открыть панель Google"
				},
				,
			],
			" ",
			[
				"button",
				{
					class: "secondary-button experiment-toggle",
					title: "Экспериментальные метрики"
				},
				,
				" Эксперимент"
			]
		],
		" ",
		,
		" ",
		,
	], 1);
	function Controls($$anchor, $$props) {
		push($$props, true);
		let helpContent = /* @__PURE__ */ state(null);
		let helpTrigger = /* @__PURE__ */ state(null);
		var fragment = root_7$2();
		var div = first_child(fragment);
		var node = child(div);
		SheetCombobox(node, { get model() {
			return $$props.model;
		} });
		component(sibling(node, 2), () => Popover, ($$anchor, Popover_Root) => {
			Popover_Root($$anchor, {
				children: ($$anchor, $$slotProps) => {
					var fragment_1 = root_4$6();
					var node_2 = first_child(fragment_1);
					component(node_2, () => Popover_trigger, ($$anchor, Popover_Trigger) => {
						Popover_Trigger($$anchor, {
							class: "icon-button help-trigger",
							"aria-label": "О замерах",
							get ref() {
								return get$2(helpTrigger);
							},
							set ref($$value) {
								set(helpTrigger, $$value, true);
							},
							children: ($$anchor, $$slotProps) => {
								Circle_question_mark($$anchor, { size: 16 });
							},
							$$slots: { default: true }
						});
					});
					component(sibling(node_2, 2), () => Portal, ($$anchor, Popover_Portal) => {
						Popover_Portal($$anchor, {
							children: ($$anchor, $$slotProps) => {
								var fragment_3 = comment();
								component(first_child(fragment_3), () => Popover_content, ($$anchor, Popover_Content) => {
									Popover_Content($$anchor, {
										class: "ui-help",
										sideOffset: 8,
										align: "end",
										tabindex: "-1",
										"aria-label": "Об инструменте",
										onOpenAutoFocus: (event) => {
											event.preventDefault();
											get$2(helpContent)?.focus({ preventScroll: true });
										},
										onInteractOutside: (event) => {
											if (event.composedPath().includes(get$2(helpTrigger))) event.preventDefault();
										},
										get ref() {
											return get$2(helpContent);
										},
										set ref($$value) {
											set(helpContent, $$value, true);
										},
										children: ($$anchor, $$slotProps) => {
											var fragment_4 = root_3$8();
											var div_1 = first_child(fragment_4);
											component(sibling(child(div_1)), () => Popover_close, ($$anchor, Popover_Close) => {
												Popover_Close($$anchor, {
													class: "icon-button help-close",
													"aria-label": "Закрыть справку",
													children: ($$anchor, $$slotProps) => {
														X($$anchor, { size: 14 });
													},
													$$slots: { default: true }
												});
											});
											reset(div_1);
											var node_6 = sibling(div_1, 4);
											var consequent = ($$anchor) => {
												append($$anchor, root$14());
											};
											if_block(node_6, ($$render) => {
												if ($$props.model.isDemo) $$render(consequent);
											});
											var node_7 = sibling(node_6, 12);
											var consequent_1 = ($$anchor) => {
												var fragment_6 = root_1$11();
												next$1(2);
												append($$anchor, fragment_6);
											};
											if_block(node_7, ($$render) => {
												if (!$$props.model.isDemo) $$render(consequent_1);
											});
											var div_2 = sibling(node_7, 2);
											var button = child(div_2);
											Download(child(button), { size: 13 });
											next$1();
											reset(button);
											var node_9 = sibling(button, 2);
											var consequent_2 = ($$anchor) => {
												var button_1 = root_2$10();
												delegated("click", button_1, () => $$props.model.disconnect());
												append($$anchor, button_1);
											};
											if_block(node_9, ($$render) => {
												if (!$$props.model.isDemo && !$$props.model.needsSetup) $$render(consequent_2);
											});
											reset(div_2);
											delegated("click", button, () => $$props.model.download());
											append($$anchor, fragment_4);
										},
										$$slots: { default: true }
									});
								});
								append($$anchor, fragment_3);
							},
							$$slots: { default: true }
						});
					});
					append($$anchor, fragment_1);
				},
				$$slots: { default: true }
			});
		});
		reset(div);
		var div_3 = sibling(div, 2);
		var button_2 = child(div_3);
		var node_10 = child(button_2);
		var consequent_3 = ($$anchor) => {
			Hourglass($$anchor, { size: 14 });
		};
		var alternate = ($$anchor) => {
			Rotate_cw($$anchor, { size: 14 });
		};
		if_block(node_10, ($$render) => {
			if ($$props.model.running) $$render(consequent_3);
			else $$render(alternate, -1);
		});
		var text = sibling(node_10);
		reset(button_2);
		var button_3 = sibling(button_2, 2);
		Panel_right(child(button_3), { size: 15 });
		reset(button_3);
		var button_4 = sibling(button_3, 2);
		Flask_conical(child(button_4), { size: 14 });
		next$1();
		reset(button_4);
		reset(div_3);
		var node_13 = sibling(div_3, 2);
		var consequent_4 = ($$anchor) => {
			var div_4 = root_5$4();
			var button_5 = sibling(child(div_4));
			reset(div_4);
			delegated("click", button_5, () => $$props.model.connect());
			append($$anchor, div_4);
		};
		if_block(node_13, ($$render) => {
			if ($$props.model.needsSetup) $$render(consequent_4);
		});
		var node_14 = sibling(node_13, 2);
		var consequent_5 = ($$anchor) => {
			var p_1 = root_6$4();
			var text_1 = only_child(p_1, true);
			template_effect(() => set_text(text_1, $$props.model.error));
			append($$anchor, p_1);
		};
		if_block(node_14, ($$render) => {
			if ($$props.model.error) $$render(consequent_5);
		});
		template_effect(() => {
			button_2.disabled = $$props.model.running;
			set_text(text, ` ${$$props.model.running ? "Расчёт…" : "Пересчитать"}`);
			set_attribute(button_4, "aria-pressed", $$props.model.experimentalOpen ?? false);
		});
		delegated("click", button_2, () => $$props.model.recalculate());
		delegated("click", button_3, () => $$props.model.openGoogle());
		delegated("click", button_4, () => $$props.model.setExperimental(!$$props.model.experimentalOpen));
		append($$anchor, fragment);
		pop();
	}
	delegate(["click"]);
	//#endregion
	//#region userscript/src/ui/PhaseChart.svelte
	var root$13 = /* @__PURE__ */ from_tree([["button", {
		type: "button",
		tabindex: "-1"
	}]]);
	var root_1$10 = /* @__PURE__ */ from_tree([[
		"span",
		{
			class: "phase-readout",
			"aria-hidden": "true"
		},
		" "
	]]);
	var root_2$9 = /* @__PURE__ */ from_tree([[
		"li",
		null,
		[
			"button",
			{ type: "button" },
			["span", { class: "phase-dot" }],
			[
				"span",
				null,
				" "
			],
			[
				"b",
				null,
				" "
			]
		]
	]]);
	var root_3$7 = /* @__PURE__ */ from_tree([[
		"figcaption",
		{ class: "chart-insight" },
		[
			"span",
			{ class: "insight-value" },
			" "
		],
		[
			"span",
			null,
			" "
		]
	]]);
	var root_4$5 = /* @__PURE__ */ from_tree([[
		"figure",
		{ "aria-label": "Распределение времени по этапам" },
		[
			"div",
			{ class: "chart-heading" },
			[
				"span",
				null,
				" "
			],
			[
				"b",
				null,
				" "
			]
		],
		" ",
		[
			"div",
			{ class: "phase-stack" },
			,
			" ",
			,
		],
		" ",
		["ul", { class: "phase-legend" }],
		" ",
		,
	]]);
	function PhaseChart($$anchor, $$props) {
		push($$props, true);
		let small = prop($$props, "small", 3, false);
		let complete = /* @__PURE__ */ user_derived(() => $$props.phases.length > 0 && $$props.phases.every((phase) => phase.ms != null));
		let measured = /* @__PURE__ */ user_derived(() => $$props.phases.filter((phase) => phase.ms != null));
		let total = /* @__PURE__ */ user_derived(() => get$2(measured).length ? get$2(measured).reduce((sum, phase) => sum + phase.ms, 0) : null);
		let largest = /* @__PURE__ */ user_derived(() => $$props.phases.reduce((best, phase) => !best || phase.ms > best.ms ? phase : best, null));
		let hovered = /* @__PURE__ */ state(null);
		let focused = /* @__PURE__ */ state(null);
		let active = /* @__PURE__ */ user_derived(() => get$2(hovered) ?? get$2(focused));
		let activePhase = /* @__PURE__ */ user_derived(() => $$props.phases.find((phase) => phase.id === get$2(active)));
		let labelPosition = /* @__PURE__ */ user_derived(() => {
			if (!get$2(activePhase) || !get$2(total)) return 50;
			const index = get$2(measured).indexOf(get$2(activePhase));
			if (index < 0) return 50;
			return (get$2(measured).slice(0, index).reduce((sum, phase) => sum + phase.ms, 0) + get$2(activePhase).ms / 2) / get$2(total) * 100;
		});
		var figure = root_4$5();
		let classes;
		var div = child(figure);
		var span = child(div);
		var text = only_child(span, true);
		var text_1 = only_child(sibling(span), true);
		reset(div);
		var div_1 = sibling(div, 2);
		var node = child(div_1);
		var consequent = ($$anchor) => {
			var fragment = comment();
			each(first_child(fragment), 17, () => get$2(measured), (phase) => phase.id, ($$anchor, phase) => {
				var button = root$13();
				let classes_1;
				let styles;
				template_effect(($0) => {
					classes_1 = set_class(button, 1, "phase-segment", null, classes_1, { dimmed: get$2(active) !== null && get$2(active) !== get$2(phase).id });
					set_attribute(button, "aria-label", $0);
					styles = set_style(button, "", styles, {
						"flex-grow": get$2(phase).ms,
						background: get$2(phase).color
					});
				}, [() => `${get$2(phase).label}: ${formatTime(get$2(phase).ms)}`]);
				event("pointerenter", button, () => {
					set(hovered, get$2(phase).id, true);
				});
				event("pointerleave", button, () => {
					set(hovered, null);
				});
				event("focus", button, (event) => {
					if (event.currentTarget.matches(":focus-visible")) set(focused, get$2(phase).id, true);
				});
				event("blur", button, () => {
					set(focused, null);
				});
				append($$anchor, button);
			});
			append($$anchor, fragment);
		};
		if_block(node, ($$render) => {
			if (get$2(total) > 0) $$render(consequent);
		});
		var node_2 = sibling(node, 2);
		var consequent_1 = ($$anchor) => {
			var span_1 = root_1$10();
			let styles_1;
			var text_2 = only_child(span_1, true);
			template_effect(($0) => {
				styles_1 = set_style(span_1, "", styles_1, { left: `clamp(32px, ${get$2(labelPosition)}%, calc(100% - 32px))` });
				set_text(text_2, $0);
			}, [() => formatTime(get$2(activePhase).ms)]);
			append($$anchor, span_1);
		};
		if_block(node_2, ($$render) => {
			if (get$2(activePhase)) $$render(consequent_1);
		});
		reset(div_1);
		var ul = sibling(div_1, 2);
		each(ul, 21, () => $$props.phases, (phase) => phase.id, ($$anchor, phase) => {
			var li = root_2$9();
			var button_1 = child(li);
			let classes_2;
			var span_2 = child(button_1);
			let styles_2;
			var span_3 = sibling(span_2);
			var text_3 = only_child(span_3, true);
			var text_4 = only_child(sibling(span_3), true);
			reset(button_1);
			reset(li);
			template_effect(($0) => {
				classes_2 = set_class(button_1, 1, "phase-key", null, classes_2, { dimmed: get$2(active) !== null && get$2(active) !== get$2(phase).id });
				styles_2 = set_style(span_2, "", styles_2, { background: get$2(phase).color });
				set_text(text_3, get$2(phase).label);
				set_text(text_4, $0);
			}, [() => formatTime(get$2(phase).ms)]);
			event("pointerenter", button_1, () => {
				set(hovered, get$2(phase).id, true);
			});
			event("pointerleave", button_1, () => {
				set(hovered, null);
			});
			event("focus", button_1, (event) => {
				if (event.currentTarget.matches(":focus-visible")) set(focused, get$2(phase).id, true);
			});
			event("blur", button_1, () => {
				set(focused, null);
			});
			append($$anchor, li);
		});
		reset(ul);
		var node_3 = sibling(ul, 2);
		var consequent_2 = ($$anchor) => {
			var figcaption = root_3$7();
			var span_4 = child(figcaption);
			var text_5 = only_child(span_4);
			var text_6 = only_child(sibling(span_4));
			reset(figcaption);
			template_effect(($0, $1) => {
				set_text(text_5, `${$0 ?? ""}%`);
				set_text(text_6, `времени — ${$1 ?? ""}`);
			}, [() => Math.round(get$2(largest).ms / get$2(total) * 100), () => get$2(largest).label.toLocaleLowerCase("ru-RU")]);
			append($$anchor, figcaption);
		};
		if_block(node_3, ($$render) => {
			if (get$2(complete) && get$2(largest) && get$2(total) > 0) $$render(consequent_2);
		});
		reset(figure);
		template_effect(($0) => {
			classes = set_class(figure, 1, "phase-chart", null, classes, { small: small() });
			set_text(text, get$2(complete) ? "Общий расчёт" : "Известное время");
			set_text(text_1, $0);
		}, [() => formatTime(get$2(total))]);
		append($$anchor, figure);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/CellCapacity.svelte
	var root$12 = /* @__PURE__ */ from_tree([
		[
			"div",
			{
				class: "capacity-track",
				role: "meter",
				"aria-valuemin": "0"
			},
			["div", { class: "capacity-fill" }]
		],
		" ",
		[
			"p",
			{ class: "capacity-caption" },
			[
				"span",
				null,
				" "
			],
			" "
		]
	], 1);
	var root_1$9 = /* @__PURE__ */ from_tree([
		["div", {
			class: "capacity-track",
			"aria-hidden": "true"
		}],
		" ",
		[
			"p",
			{ class: "capacity-caption" },
			" "
		]
	], 1);
	var root_2$8 = /* @__PURE__ */ from_tree([[
		"section",
		{ class: "cell-capacity" },
		[
			"h3",
			null,
			"Число ячеек"
		],
		" ",
		,
	]]);
	function CellCapacity($$anchor, $$props) {
		const id = props_id();
		push($$props, true);
		const compact = new Intl.NumberFormat("ru-RU", {
			notation: "compact",
			compactDisplay: "long",
			maximumFractionDigits: 1
		});
		const exact = new Intl.NumberFormat("ru-RU");
		const available = /* @__PURE__ */ user_derived(() => Number.isFinite($$props.count) && $$props.count >= 0 && Number.isFinite($$props.limit) && $$props.limit > 0);
		const fill = /* @__PURE__ */ user_derived(() => get$2(available) ? Math.min($$props.count / $$props.limit, 1) * 100 : null);
		const description = /* @__PURE__ */ user_derived(() => get$2(available) ? `${exact.format($$props.count)} из ${exact.format($$props.limit)} ячеек` : "Данные недоступны");
		var section = root_2$8();
		var h3 = child(section);
		var node = sibling(h3, 2);
		var consequent = ($$anchor) => {
			var fragment = root$12();
			var div = first_child(fragment);
			var div_1 = child(div);
			let styles;
			reset(div);
			var p = sibling(div, 2);
			var span = child(p);
			var text = only_child(span, true);
			var text_1 = sibling(span);
			reset(p);
			template_effect(($0, $1, $2) => {
				set_attribute(div, "aria-labelledby", id);
				set_attribute(div, "aria-valuemax", $$props.limit);
				set_attribute(div, "aria-valuenow", $0);
				set_attribute(div, "aria-valuetext", get$2(description));
				set_attribute(div, "title", get$2(description));
				styles = set_style(div_1, "", styles, { width: `${get$2(fill)}%` });
				set_attribute(p, "title", get$2(description));
				set_text(text, $1);
				set_text(text_1, ` из ${$2 ?? ""}`);
			}, [
				() => Math.min($$props.count, $$props.limit),
				() => compact.format($$props.count),
				() => compact.format($$props.limit)
			]);
			append($$anchor, fragment);
		};
		var alternate = ($$anchor) => {
			var fragment_1 = root_1$9();
			var text_2 = only_child(sibling(first_child(fragment_1), 2), true);
			template_effect(() => set_text(text_2, get$2(description)));
			append($$anchor, fragment_1);
		};
		if_block(node, ($$render) => {
			if (get$2(available)) $$render(consequent);
			else $$render(alternate, -1);
		});
		reset(section);
		template_effect(() => {
			set_attribute(section, "aria-labelledby", id);
			set_attribute(h3, "id", id);
		});
		append($$anchor, section);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/size-observer.js
	var listeners = /* @__PURE__ */ new Map();
	var observer;
	function observeBlockSize(node, onSize) {
		if (!observer) observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const notify = listeners.get(entry.target);
				if (!notify) continue;
				const borderBox = entry.borderBoxSize;
				const blockSize = Array.isArray(borderBox) ? borderBox[0]?.blockSize : borderBox?.blockSize;
				notify(Math.ceil(blockSize ?? entry.contentRect.height));
			}
		});
		listeners.set(node, onSize);
		observer.observe(node);
		return () => {
			listeners.delete(node);
			observer?.unobserve(node);
			if (listeners.size === 0) {
				observer?.disconnect();
				observer = void 0;
			}
		};
	}
	//#endregion
	//#region userscript/src/ui/FormulaPreview.svelte
	var root$11 = /* @__PURE__ */ from_tree([[
		"span",
		{
			class: "formula-expand-icon",
			"aria-hidden": "true"
		},
		,
	]]);
	var root_1$8 = /* @__PURE__ */ from_tree([
		[
			"span",
			null,
			[
				"code",
				null,
				" "
			]
		],
		" ",
		,
	], 1);
	var root_2$7 = /* @__PURE__ */ from_tree([[
		"button",
		null,
		,
	]]);
	var root_3$6 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "formula-preview" },
		,
	]]);
	function FormulaPreview($$anchor, $$props) {
		push($$props, true);
		const content = ($$anchor) => {
			var fragment = root_1$8();
			var span = first_child(fragment);
			let classes;
			var code = child(span);
			var text = only_child(code, true);
			attach(code, () => measure);
			reset(span);
			var node_1 = sibling(span, 2);
			var consequent = ($$anchor) => {
				var span_1 = root$11();
				Chevron_down(child(span_1), { size: 12 });
				reset(span_1);
				append($$anchor, span_1);
			};
			if_block(node_1, ($$render) => {
				if (get$2(overflowing)) $$render(consequent);
			});
			template_effect(() => {
				classes = set_class(span, 1, "formula-clip", null, classes, { faded: get$2(overflowing) && !get$2(expanded) });
				set_text(text, $$props.formula);
			});
			append($$anchor, fragment);
		};
		const previewHeight = 32;
		let expanded = /* @__PURE__ */ state(false);
		let fullHeight = /* @__PURE__ */ state(previewHeight);
		let overflowing = /* @__PURE__ */ user_derived(() => get$2(fullHeight) > 33);
		function measure(node) {
			return observeBlockSize(node, (height) => {
				set(fullHeight, height, true);
			});
		}
		var fragment_1 = comment();
		var node_3 = first_child(fragment_1);
		var consequent_1 = ($$anchor) => {
			var button = root_2$7();
			let classes_1;
			let styles;
			var node_4 = child(button);
			content(node_4);
			reset(button);
			template_effect(() => {
				classes_1 = set_class(button, 1, "formula-preview", null, classes_1, { expanded: get$2(expanded) });
				set_attribute(button, "aria-expanded", get$2(expanded));
				set_attribute(button, "aria-label", `${get$2(expanded) ? "Свернуть" : "Раскрыть"} формулу ${$$props.address}`);
				set_attribute(button, "title", $$props.description);
				styles = set_style(button, "", styles, { height: `${get$2(expanded) ? get$2(fullHeight) : previewHeight}px` });
			});
			delegated("click", button, () => {
				set(expanded, !get$2(expanded));
			});
			append($$anchor, button);
		};
		var alternate = ($$anchor) => {
			var div = root_3$6();
			var node_5 = child(div);
			content(node_5);
			reset(div);
			template_effect(() => set_attribute(div, "title", $$props.description));
			append($$anchor, div);
		};
		if_block(node_3, ($$render) => {
			if (get$2(overflowing)) $$render(consequent_1);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment_1);
		pop();
	}
	delegate(["click"]);
	//#endregion
	//#region userscript/src/ui/CellList.svelte
	var root$10 = /* @__PURE__ */ from_tree([[
		"a",
		{ class: "cell-address" },
		" "
	]]);
	var root_1$7 = /* @__PURE__ */ from_tree([[
		"span",
		{ class: "cell-address" },
		"Адрес недоступен"
	]]);
	var root_2$6 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "cell-rule" },
		" "
	]]);
	var root_3$5 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "cell-rule" },
		" "
	]]);
	var root_4$4 = /* @__PURE__ */ from_tree([[
		"li",
		null,
		[
			"div",
			{ class: "cell-main" },
			["span", {
				class: "cell-type-dot",
				role: "img"
			}],
			" ",
			,
			" ",
			[
				"span",
				{ class: "cell-time" },
				" "
			]
		],
		" ",
		,
	]]);
	var root_5$3 = /* @__PURE__ */ from_tree([[
		"li",
		{ class: "empty-cells" },
		"Для этого листа и типа в доступных замерах нет результатов."
	]]);
	var root_6$3 = /* @__PURE__ */ from_tree([[
		"div",
		{
			class: "cell-list-viewport",
			role: "region",
			"aria-label": "Результаты вычислений",
			tabindex: "0"
		},
		[
			"ol",
			{ class: "cell-list" },
			,
			" ",
			,
		]
	]]);
	function CellList($$anchor, $$props) {
		push($$props, true);
		let all = prop($$props, "all", 3, false), type = prop($$props, "type", 3, "all");
		let shown = /* @__PURE__ */ user_derived(() => rankCells($$props.model.cells, {
			sheet: $$props.model.calculatedSheet,
			includeRelated: all(),
			type: type()
		}));
		var div = root_6$3();
		var ol = child(div);
		var node = child(ol);
		each(node, 17, () => get$2(shown), (cell) => `${cell.sheet}:${cell.address ?? `${cell.row}:${cell.col}`}:${cell.type}`, ($$anchor, cell) => {
			var li = root_4$4();
			var div_1 = child(li);
			var span = child(div_1);
			let styles;
			var node_1 = sibling(span, 2);
			var consequent = ($$anchor) => {
				var a = root$10();
				var text = only_child(a);
				template_effect(($0, $1, $2) => {
					set_attribute(a, "href", $0);
					set_attribute(a, "title", $1);
					set_text(text, `${$2 ?? ""}!${get$2(cell).address ?? ""}`);
				}, [
					() => $$props.model.cellHref(get$2(cell)),
					() => `${$$props.model.sheetName(get$2(cell).sheet)}!${get$2(cell).address}`,
					() => $$props.model.sheetName(get$2(cell).sheet)
				]);
				delegated("click", a, (event) => {
					if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
						event.preventDefault();
						$$props.model.navigate(get$2(cell));
					}
				});
				append($$anchor, a);
			};
			var alternate = ($$anchor) => {
				append($$anchor, root_1$7());
			};
			if_block(node_1, ($$render) => {
				if (get$2(cell).address && get$2(cell).sheet) $$render(consequent);
				else $$render(alternate, -1);
			});
			var text_1 = only_child(sibling(node_1, 2), true);
			reset(div_1);
			var node_2 = sibling(div_1, 2);
			var consequent_1 = ($$anchor) => {
				var p = root_2$6();
				var text_2 = only_child(p, true);
				template_effect(() => set_text(text_2, get$2(cell).rule ?? "Правило проверки недоступно"));
				append($$anchor, p);
			};
			var consequent_2 = ($$anchor) => {
				{
					let $0 = /* @__PURE__ */ user_derived(() => `${$$props.model.sheetName(get$2(cell).sheet)}!${get$2(cell).address}`);
					FormulaPreview($$anchor, {
						get formula() {
							return get$2(cell).formula;
						},
						get address() {
							return get$2($0);
						},
						get description() {
							return get$2(cell).description;
						}
					});
				}
			};
			var alternate_1 = ($$anchor) => {
				var p_1 = root_3$5();
				var text_3 = only_child(p_1, true);
				template_effect(() => set_text(text_3, get$2(cell).type === "format" ? "Правило форматирования недоступно" : "Формула не загружена"));
				append($$anchor, p_1);
			};
			if_block(node_2, ($$render) => {
				if (get$2(cell).type === "validation") $$render(consequent_1);
				else if (get$2(cell).formula) $$render(consequent_2, 1);
				else $$render(alternate_1, -1);
			});
			reset(li);
			template_effect(($0, $1, $2, $3) => {
				set_attribute(span, "aria-label", $0);
				set_attribute(span, "title", $1);
				styles = set_style(span, "", styles, { background: $2 });
				set_text(text_1, $3);
			}, [
				() => calculationType(get$2(cell).type).label,
				() => calculationType(get$2(cell).type).label,
				() => calculationType(get$2(cell).type).color,
				() => formatTime(get$2(cell).ms)
			]);
			append($$anchor, li);
		});
		var node_3 = sibling(node, 2);
		var consequent_3 = ($$anchor) => {
			append($$anchor, root_5$3());
		};
		if_block(node_3, ($$render) => {
			if (get$2(shown).length === 0) $$render(consequent_3);
		});
		reset(ol);
		reset(div);
		append($$anchor, div);
		pop();
	}
	delegate(["click"]);
	//#endregion
	//#region userscript/src/ui/SelectionIndicator.svelte
	var root$9 = /* @__PURE__ */ from_tree([["span", { "aria-hidden": "true" }]]);
	function SelectionIndicator($$anchor, $$props) {
		push($$props, true);
		let kind = prop($$props, "kind", 3, "underline");
		function position(node) {
			$$props.active;
			const parent = node.parentElement;
			const update = () => {
				const selected = parent.querySelector($$props.selector);
				if (!selected) return;
				const right = Math.max(0, parent.clientWidth - selected.offsetLeft - selected.offsetWidth);
				node.style.clipPath = `inset(0 ${right}px 0 ${selected.offsetLeft}px round ${kind() === "pill" ? 4 : 2}px)`;
				node.style.opacity = "1";
			};
			const observer = new ResizeObserver(update);
			observer.observe(parent);
			for (const button of parent.querySelectorAll("button")) observer.observe(button);
			update();
			return () => observer.disconnect();
		}
		var span = root$9();
		attach(span, () => position);
		template_effect(() => set_class(span, 1, `selection-indicator ${kind()}`));
		append($$anchor, span);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/CellScope.svelte
	var root$8 = /* @__PURE__ */ from_tree([[
		"div",
		{
			class: "cell-scope",
			role: "group",
			"aria-label": "Область результатов"
		},
		,
		" ",
		[
			"button",
			null,
			" "
		],
		" ",
		[
			"button",
			{ title: "Включая ячейки других листов из этого расчёта" },
			"Со связями"
		]
	]]);
	var root_1$6 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "scope-caption" },
		"Вся таблица"
	]]);
	function CellScope($$anchor, $$props) {
		push($$props, true);
		let all = prop($$props, "all", 15, false);
		var fragment = comment();
		var node = first_child(fragment);
		var consequent = ($$anchor) => {
			var div = root$8();
			var node_1 = child(div);
			SelectionIndicator(node_1, {
				selector: "button[aria-pressed=\"true\"]",
				get active() {
					return all();
				},
				kind: "pill"
			});
			var button = sibling(node_1, 2);
			var text = only_child(button, true);
			var button_1 = sibling(button, 2);
			reset(div);
			template_effect(($0, $1) => {
				set_attribute(button, "aria-pressed", !all());
				set_attribute(button, "title", $0);
				set_text(text, $1);
				set_attribute(button_1, "aria-pressed", all());
			}, [() => $$props.model.sheetName($$props.model.calculatedSheet), () => $$props.model.sheetName($$props.model.calculatedSheet)]);
			delegated("click", button, () => {
				all(false);
			});
			delegated("click", button_1, () => {
				all(true);
			});
			append($$anchor, div);
		};
		var alternate = ($$anchor) => {
			append($$anchor, root_1$6());
		};
		if_block(node, ($$render) => {
			if ($$props.model.calculatedSheet !== "all") $$render(consequent);
			else $$render(alternate, -1);
		});
		append($$anchor, fragment);
		pop();
	}
	delegate(["click"]);
	//#endregion
	//#region userscript/src/ui/ResultPeriod.svelte
	var root$7 = /* @__PURE__ */ from_tree([
		,
		,
		,
	], 1);
	var root_1$5 = /* @__PURE__ */ from_tree([[
		"span",
		null,
		" "
	], ,], 1);
	var root_2$5 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	var root_3$4 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "result-period" },
		,
		" ",
		[
			"time",
			{ title: "Последнее обновление результатов" },
			" "
		]
	]]);
	function ResultPeriod($$anchor, $$props) {
		push($$props, true);
		let model = prop($$props, "model", 7);
		const items = [{
			value: "last",
			label: "Последнее изменение"
		}, {
			value: "session",
			label: "С момента открытия"
		}];
		var div = root_3$4();
		var node = child(div);
		component(node, () => Select, ($$anchor, Select_Root) => {
			Select_Root($$anchor, {
				type: "single",
				get items() {
					return items;
				},
				get value() {
					return model().period;
				},
				set value($$value) {
					model().period = $$value;
				},
				children: ($$anchor, $$slotProps) => {
					var fragment = root_2$5();
					var node_1 = first_child(fragment);
					component(node_1, () => Select_trigger, ($$anchor, Select_Trigger) => {
						Select_Trigger($$anchor, {
							class: "period-select",
							"aria-label": "Период замеров",
							children: ($$anchor, $$slotProps) => {
								var fragment_1 = root$7();
								var node_2 = first_child(fragment_1);
								component(node_2, () => Select_value, ($$anchor, Select_Value) => {
									Select_Value($$anchor, {});
								});
								Chevron_down(sibling(node_2), { size: 12 });
								append($$anchor, fragment_1);
							},
							$$slots: { default: true }
						});
					});
					component(sibling(node_1, 2), () => Portal, ($$anchor, Select_Portal) => {
						Select_Portal($$anchor, {
							children: ($$anchor, $$slotProps) => {
								var fragment_2 = comment();
								component(first_child(fragment_2), () => Select_content, ($$anchor, Select_Content) => {
									Select_Content($$anchor, {
										class: "ui-select-menu",
										sideOffset: 5,
										align: "start",
										children: ($$anchor, $$slotProps) => {
											var fragment_3 = comment();
											component(first_child(fragment_3), () => Select_viewport, ($$anchor, Select_Viewport) => {
												Select_Viewport($$anchor, {
													children: ($$anchor, $$slotProps) => {
														var fragment_4 = comment();
														each(first_child(fragment_4), 17, () => items, (item) => item.value, ($$anchor, item) => {
															var fragment_5 = comment();
															var node_8 = first_child(fragment_5);
															{
																const children = ($$anchor, $$arg0) => {
																	let selected = () => ($$arg0?.()).selected;
																	var fragment_6 = root_1$5();
																	var span = first_child(fragment_6);
																	var text = only_child(span, true);
																	var node_9 = sibling(span);
																	var consequent = ($$anchor) => {
																		Check($$anchor, { size: 13 });
																	};
																	if_block(node_9, ($$render) => {
																		if (selected()) $$render(consequent);
																	});
																	template_effect(() => set_text(text, get$2(item).label));
																	append($$anchor, fragment_6);
																};
																component(node_8, () => Select_item, ($$anchor, Select_Item) => {
																	Select_Item($$anchor, {
																		get value() {
																			return get$2(item).value;
																		},
																		get label() {
																			return get$2(item).label;
																		},
																		class: "ui-select-item",
																		children,
																		$$slots: { default: true }
																	});
																});
															}
															append($$anchor, fragment_5);
														});
														append($$anchor, fragment_4);
													},
													$$slots: { default: true }
												});
											});
											append($$anchor, fragment_3);
										},
										$$slots: { default: true }
									});
								});
								append($$anchor, fragment_2);
							},
							$$slots: { default: true }
						});
					});
					append($$anchor, fragment);
				},
				$$slots: { default: true }
			});
		});
		var text_1 = only_child(sibling(node, 2), true);
		reset(div);
		template_effect(() => set_text(text_1, model().updated));
		append($$anchor, div);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/PanelFooter.svelte
	var root$6 = /* @__PURE__ */ from_tree([[
		"footer",
		{ class: "panel-footer" },
		[
			"span",
			null,
			" "
		],
		[
			"a",
			{
				href: "https://t.me/zycck",
				target: "_blank",
				rel: "noopener noreferrer"
			},
			"@zycck"
		]
	]]);
	function PanelFooter($$anchor) {
		const version = "0.3.18";
		var footer = root$6();
		var text = only_child(child(footer));
		next$1();
		reset(footer);
		template_effect(() => set_text(text, `v${version}`));
		append($$anchor, footer);
	}
	//#endregion
	//#region userscript/src/ui/TypeFilter.svelte
	var root$5 = /* @__PURE__ */ from_tree([["span", {
		class: "type-dot",
		"aria-hidden": "true"
	}]]);
	var root_1$4 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		[
			"span",
			null,
			" "
		],
		,
	], 1);
	var root_2$4 = /* @__PURE__ */ from_tree([["span", {
		class: "type-dot",
		"aria-hidden": "true"
	}]]);
	var root_3$3 = /* @__PURE__ */ from_tree([[
		"span",
		{ class: "type-option-label" },
		,
		" "
	], ,], 1);
	var root_4$3 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	function TypeFilter($$anchor, $$props) {
		push($$props, true);
		let value = prop($$props, "value", 15, "all");
		const items = [{
			value: "all",
			label: "Все типы вычислений",
			shortLabel: "Все типы"
		}, ...calculationTypes.map((type) => ({
			...type,
			value: type.id
		}))];
		let selected = /* @__PURE__ */ user_derived(() => items.find((item) => item.value === value()) ?? items[0]);
		var fragment = comment();
		component(first_child(fragment), () => Select, ($$anchor, Select_Root) => {
			Select_Root($$anchor, {
				type: "single",
				get items() {
					return items;
				},
				allowDeselect: false,
				get value() {
					return value();
				},
				set value($$value) {
					value($$value);
				},
				children: ($$anchor, $$slotProps) => {
					var fragment_1 = root_4$3();
					var node_1 = first_child(fragment_1);
					component(node_1, () => Select_trigger, ($$anchor, Select_Trigger) => {
						Select_Trigger($$anchor, {
							class: "type-select",
							"aria-label": "Тип вычислений",
							get title() {
								return get$2(selected).label;
							},
							children: ($$anchor, $$slotProps) => {
								var fragment_2 = root_1$4();
								var node_2 = first_child(fragment_2);
								var consequent = ($$anchor) => {
									var span = root$5();
									let styles;
									template_effect(() => styles = set_style(span, "", styles, { background: get$2(selected).color }));
									append($$anchor, span);
								};
								var alternate = ($$anchor) => {
									List_filter($$anchor, { size: 13 });
								};
								if_block(node_2, ($$render) => {
									if (get$2(selected).color) $$render(consequent);
									else $$render(alternate, -1);
								});
								var span_1 = sibling(node_2, 2);
								var text = only_child(span_1, true);
								Chevron_down(sibling(span_1), { size: 12 });
								template_effect(() => set_text(text, get$2(selected).shortLabel));
								append($$anchor, fragment_2);
							},
							$$slots: { default: true }
						});
					});
					component(sibling(node_1, 2), () => Portal, ($$anchor, Select_Portal) => {
						Select_Portal($$anchor, {
							children: ($$anchor, $$slotProps) => {
								var fragment_4 = comment();
								component(first_child(fragment_4), () => Select_content, ($$anchor, Select_Content) => {
									Select_Content($$anchor, {
										class: "ui-select-menu type-menu",
										sideOffset: 6,
										align: "end",
										children: ($$anchor, $$slotProps) => {
											var fragment_5 = comment();
											component(first_child(fragment_5), () => Select_viewport, ($$anchor, Select_Viewport) => {
												Select_Viewport($$anchor, {
													children: ($$anchor, $$slotProps) => {
														var fragment_6 = comment();
														each(first_child(fragment_6), 17, () => items, (item) => item.value, ($$anchor, item) => {
															var fragment_7 = comment();
															var node_8 = first_child(fragment_7);
															{
																const children = ($$anchor, $$arg0) => {
																	let selected = () => ($$arg0?.()).selected;
																	var fragment_8 = root_3$3();
																	var span_2 = first_child(fragment_8);
																	var node_9 = child(span_2);
																	var consequent_1 = ($$anchor) => {
																		var span_3 = root_2$4();
																		let styles_1;
																		template_effect(() => styles_1 = set_style(span_3, "", styles_1, { background: get$2(item).color }));
																		append($$anchor, span_3);
																	};
																	if_block(node_9, ($$render) => {
																		if (get$2(item).color) $$render(consequent_1);
																	});
																	var text_1 = sibling(node_9, 1, true);
																	reset(span_2);
																	var node_10 = sibling(span_2);
																	var consequent_2 = ($$anchor) => {
																		Check($$anchor, { size: 13 });
																	};
																	if_block(node_10, ($$render) => {
																		if (selected()) $$render(consequent_2);
																	});
																	template_effect(() => set_text(text_1, get$2(item).label));
																	append($$anchor, fragment_8);
																};
																component(node_8, () => Select_item, ($$anchor, Select_Item) => {
																	Select_Item($$anchor, {
																		get value() {
																			return get$2(item).value;
																		},
																		get label() {
																			return get$2(item).label;
																		},
																		class: "ui-select-item",
																		children,
																		$$slots: { default: true }
																	});
																});
															}
															append($$anchor, fragment_7);
														});
														append($$anchor, fragment_6);
													},
													$$slots: { default: true }
												});
											});
											append($$anchor, fragment_5);
										},
										$$slots: { default: true }
									});
								});
								append($$anchor, fragment_4);
							},
							$$slots: { default: true }
						});
					});
					append($$anchor, fragment_1);
				},
				$$slots: { default: true }
			});
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/MetricHelp.svelte
	var root$4 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	function MetricHelp($$anchor, $$props) {
		push($$props, true);
		let trigger = /* @__PURE__ */ state(null);
		var fragment = comment();
		component(first_child(fragment), () => Popover, ($$anchor, Popover_Root) => {
			Popover_Root($$anchor, {
				children: ($$anchor, $$slotProps) => {
					var fragment_1 = root$4();
					var node_1 = first_child(fragment_1);
					{
						let $0 = /* @__PURE__ */ user_derived(() => `О показателе «${$$props.label}»`);
						component(node_1, () => Popover_trigger, ($$anchor, Popover_Trigger) => {
							Popover_Trigger($$anchor, {
								class: "metric-help-trigger",
								get "aria-label"() {
									return get$2($0);
								},
								get ref() {
									return get$2(trigger);
								},
								set ref($$value) {
									set(trigger, $$value, true);
								},
								children: ($$anchor, $$slotProps) => {
									Circle_question_mark($$anchor, { size: 12 });
								},
								$$slots: { default: true }
							});
						});
					}
					component(sibling(node_1, 2), () => Portal, ($$anchor, Popover_Portal) => {
						Popover_Portal($$anchor, {
							children: ($$anchor, $$slotProps) => {
								var fragment_3 = comment();
								component(first_child(fragment_3), () => Popover_content, ($$anchor, Popover_Content) => {
									Popover_Content($$anchor, {
										class: "glossary-tooltip metric-help",
										sideOffset: 6,
										onOpenAutoFocus: (event) => event.preventDefault(),
										onInteractOutside: (event) => {
											if (event.composedPath().includes(get$2(trigger))) event.preventDefault();
										},
										children: ($$anchor, $$slotProps) => {
											next$1();
											var text_1 = text();
											template_effect(() => set_text(text_1, $$props.text));
											append($$anchor, text_1);
										},
										$$slots: { default: true }
									});
								});
								append($$anchor, fragment_3);
							},
							$$slots: { default: true }
						});
					});
					append($$anchor, fragment_1);
				},
				$$slots: { default: true }
			});
		});
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/RelationsPanel.svelte
	var root$3 = /* @__PURE__ */ from_tree([[
		"p",
		{
			class: "experiment-note",
			role: "status"
		},
		"Читаем связи…"
	]]);
	var root_1$3 = /* @__PURE__ */ from_tree([[
		"p",
		{
			class: "experiment-note",
			role: "status"
		},
		" "
	]]);
	var root_2$3 = /* @__PURE__ */ from_tree([[
		"span",
		null,
		" "
	]]);
	var root_3$2 = /* @__PURE__ */ from_tree([[
		"li",
		null,
		[
			"code",
			null,
			" "
		],
		,
	]]);
	var root_4$2 = /* @__PURE__ */ from_tree([["ul", { class: "relation-list" }]]);
	var root_5$2 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		" "
	]]);
	var root_6$2 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Показана часть индекса: достигнут лимит чтения или есть неизвестные записи."
	]]);
	var root_7$1 = /* @__PURE__ */ from_tree([[
		"section",
		{ class: "relation-group" },
		[
			"div",
			{ class: "experiment-context" },
			[
				"span",
				null,
				" "
			],
			,
		],
		" ",
		,
		" ",
		,
	]]);
	var root_8$1 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Часть ссылок недоступна или превышает лимит чтения."
	]]);
	var root_9$1 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
		" ",
		[
			"p",
			{ class: "experiment-note" },
			"Только загруженные данные. Отсутствие записи не доказывает отсутствие связи."
		]
	], 1);
	var root_10$1 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "relations-panel" },
		[
			"div",
			{ class: "relations-heading" },
			[
				"strong",
				null,
				" "
			],
			" ",
			[
				"span",
				{ class: "relation-live" },
				" "
			]
		],
		" ",
		[
			"p",
			{ class: "experiment-note" },
			"Нажмите другую ячейку — связи обновятся здесь. Окно останется открытым."
		],
		" ",
		[
			"div",
			{ class: "relations-scroll" },
			,
		]
	]]);
	function RelationsPanel($$anchor, $$props) {
		push($$props, true);
		let data = /* @__PURE__ */ user_derived(() => $$props.model.relations);
		let groups = /* @__PURE__ */ user_derived(() => [
			{
				id: "static",
				label: "Ссылки в формуле",
				items: get$2(data)?.static,
				help: "Диапазоны из нативной модели формулы. Повторы объединены. Это ссылки, а не измерение фактических чтений или времени."
			},
			{
				id: "inputs",
				label: "Связи расчёта",
				items: get$2(data)?.dynamic?.filter((item) => item.type !== "FROM_ARRAY_EXPR_TO_RESULT_RANGE"),
				help: "Связи, переданные движком: диапазоны, структура листа, форматирование и проверка данных. Тип связи указан рядом."
			},
			{
				id: "outputs",
				label: "Выход массива",
				items: get$2(data)?.dynamic?.filter((item) => item.type === "FROM_ARRAY_EXPR_TO_RESULT_RANGE"),
				help: "Диапазон, куда выражение массива выводит результат. Это не входные данные формулы."
			},
			{
				id: "reverse",
				label: "Кто может использовать",
				items: get$2(data)?.reverse?.available ? get$2(data).reverse.entries : null,
				help: "Кандидаты из обратного индекса формул загруженного листа. Диапазон может содержать несколько формул; связь каждой клетки отдельно не проверена. Это не полная карта книги."
			}
		]);
		const names = {
			FROM_ARRAY_VALUE_TO_ARRAY_EXPRESSION: "Выражение массива",
			FROM_FORMULA_TO_GRID_STRUCTURE: "Структура листа",
			FROM_CONDITIONAL_FORMAT_TO_GRID_STRUCTURE: "Форматирование · структура",
			FROM_DATA_VALIDATION_TO_GRID_STRUCTURE: "Проверка данных · структура",
			FROM_FORMULA_TO_RANGE: "Диапазон формулы",
			FROM_CONDITIONAL_FORMAT_TO_RANGE: "Условное форматирование",
			FROM_DATA_VALIDATION_TO_RANGE: "Проверка данных"
		};
		var div = root_10$1();
		var div_1 = child(div);
		var strong = child(div_1);
		var text = only_child(strong, true);
		var text_1 = only_child(sibling(strong, 2), true);
		reset(div_1);
		var div_2 = sibling(div_1, 4);
		var node = child(div_2);
		var consequent = ($$anchor) => {
			append($$anchor, root$3());
		};
		var consequent_1 = ($$anchor) => {
			var p_1 = root_1$3();
			var text_2 = only_child(p_1, true);
			template_effect(() => set_text(text_2, get$2(data).reason ?? "Выберите одну ячейку."));
			append($$anchor, p_1);
		};
		var alternate_1 = ($$anchor) => {
			var fragment = root_9$1();
			var node_1 = first_child(fragment);
			each(node_1, 17, () => get$2(groups), (group) => group.id, ($$anchor, group) => {
				var section = root_7$1();
				var div_3 = child(section);
				var span_1 = child(div_3);
				var text_3 = only_child(span_1);
				MetricHelp(sibling(span_1), {
					get label() {
						return get$2(group).label;
					},
					get text() {
						return get$2(group).help;
					}
				});
				reset(div_3);
				var node_3 = sibling(div_3, 2);
				var consequent_3 = ($$anchor) => {
					var ul = root_4$2();
					each(ul, 21, () => get$2(group).items, (item) => item.key, ($$anchor, item) => {
						var li = root_3$2();
						var code = child(li);
						var text_4 = only_child(code);
						var node_4 = sibling(code);
						var consequent_2 = ($$anchor) => {
							var span_2 = root_2$3();
							var text_5 = only_child(span_2, true);
							template_effect(() => set_text(text_5, names[get$2(item).type]));
							append($$anchor, span_2);
						};
						if_block(node_4, ($$render) => {
							if (names[get$2(item).type]) $$render(consequent_2);
						});
						reset(li);
						template_effect(($0) => set_text(text_4, `${$0 ?? ""}!${get$2(item).address ?? ""}`), [() => $$props.model.sheetName(get$2(item).sheetId)]);
						append($$anchor, li);
					});
					reset(ul);
					append($$anchor, ul);
				};
				var alternate = ($$anchor) => {
					var p_2 = root_5$2();
					var text_6 = only_child(p_2, true);
					template_effect(() => set_text(text_6, get$2(group).items === null || get$2(group).items === void 0 ? "Google не предоставил данные." : "В доступных данных нет записей."));
					append($$anchor, p_2);
				};
				if_block(node_3, ($$render) => {
					if (get$2(group).items?.length) $$render(consequent_3);
					else $$render(alternate, -1);
				});
				var node_5 = sibling(node_3, 2);
				var consequent_4 = ($$anchor) => {
					append($$anchor, root_6$2());
				};
				if_block(node_5, ($$render) => {
					if (get$2(group).id === "reverse" && get$2(data).reverse?.partial) $$render(consequent_4);
				});
				reset(section);
				template_effect(() => {
					set_attribute(section, "aria-label", get$2(group).label);
					set_text(text_3, `${get$2(group).label ?? ""}${get$2(group).items?.length ? ` · ${get$2(group).items.length}` : ""}`);
				});
				append($$anchor, section);
			});
			var node_6 = sibling(node_1, 2);
			var consequent_5 = ($$anchor) => {
				append($$anchor, root_8$1());
			};
			if_block(node_6, ($$render) => {
				if (get$2(data).partial) $$render(consequent_5);
			});
			next$1(2);
			append($$anchor, fragment);
		};
		if_block(node, ($$render) => {
			if (!get$2(data) || get$2(data).status === "loading") $$render(consequent);
			else if (get$2(data).status !== "read") $$render(consequent_1, 1);
			else $$render(alternate_1, -1);
		});
		reset(div_2);
		reset(div);
		attach(div, () => () => $$props.model.watchRelations());
		template_effect(($0) => {
			set_text(text, $0);
			set_text(text_1, $$props.model.isDemo ? "Демо" : "Автообновление");
			set_attribute(div_2, "aria-busy", get$2(data)?.status === "loading");
		}, [() => get$2(data)?.selection ? `${$$props.model.sheetName(get$2(data).selection.sheetId)}!${get$2(data).selection.address}` : "Выбранная ячейка"]);
		append($$anchor, div);
		pop();
	}
	//#endregion
	//#region userscript/src/ui/ExperimentalPanel.svelte
	var root$2 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
		" ",
		,
		" ",
		,
		" ",
		,
	], 1);
	var root_1$2 = /* @__PURE__ */ from_tree([" ", ,], 1);
	var root_2$2 = /* @__PURE__ */ from_tree([[
		"span",
		null,
		" "
	], ,], 1);
	var root_3$1 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	var root_4$1 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Пока нет снимка поддерживаемого движка. Запустите расчёт."
	]]);
	var root_5$1 = /* @__PURE__ */ from_tree([[
		"p",
		{
			class: "experiment-note",
			role: "status"
		},
		" "
	]]);
	var root_6$1 = /* @__PURE__ */ from_tree([["p", {
		class: "experiment-note",
		role: "status"
	}]]);
	var root_7 = /* @__PURE__ */ from_tree([[
		"span",
		{ title: "Данные есть не во всех выбранных фазах" },
		"*"
	]]);
	var root_8 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		[
			"dt",
			null,
			" ",
			,
		],
		" ",
		[
			"dd",
			null,
			" ",
			,
		]
	]]);
	var root_9 = /* @__PURE__ */ from_tree([[
		"details",
		{ class: "experiment-group" },
		[
			"summary",
			null,
			" ",
			,
		],
		" ",
		["dl", { class: "metric-list" }]
	]]);
	var root_10 = /* @__PURE__ */ from_tree([
		[
			"div",
			{ class: "experiment-context" },
			,
			" ",
			,
		],
		" ",
		,
		" ",
		,
		" ",
		,
		" ",
		,
		" ",
		[
			"p",
			{ class: "experiment-note" },
			"— нет данных · * неполная сумма"
		]
	], 1);
	var root_11 = /* @__PURE__ */ from_tree([[
		"li",
		null,
		[
			"div",
			null,
			[
				"code",
				null,
				" "
			],
			[
				"span",
				null,
				" "
			]
		],
		[
			"b",
			null,
			" "
		]
	]]);
	var root_12 = /* @__PURE__ */ from_tree([["ol", { class: "function-list" }]]);
	var root_13 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		" "
	]]);
	var root_14 = /* @__PURE__ */ from_tree([["p", { class: "experiment-note" }]]);
	var root_15 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Часть записей имеет неизвестный формат."
	]]);
	var root_16 = /* @__PURE__ */ from_tree([
		[
			"div",
			{ class: "experiment-context" },
			[
				"span",
				null,
				"Срабатывания функций"
			],
			,
		],
		" ",
		,
		" ",
		,
		" ",
		,
	], 1);
	var root_17 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		[
			"dt",
			null,
			" ",
			,
		],
		[
			"dd",
			null,
			" "
		]
	]]);
	var root_18 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "raw-metric" },
		[
			"code",
			null,
			" "
		],
		[
			"span",
			null,
			" "
		]
	]]);
	var root_19 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Показаны первые 1000 ключей журнала."
	]]);
	var root_20 = /* @__PURE__ */ from_tree([
		[
			"p",
			{ class: "experiment-note" },
			"Исходные значения · единицы не установлены"
		],
		" ",
		,
		" ",
		,
	], 1);
	var root_21 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		" "
	]]);
	var root_22 = /* @__PURE__ */ from_tree([
		[
			"p",
			{ class: "experiment-value" },
			" "
		],
		" ",
		[
			"p",
			{ class: "experiment-note" },
			" "
		],
		" ",
		[
			"button",
			{ class: "text-button" },
			"Открыть панель Google"
		]
	], 1);
	var root_23 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Доступно в Google Таблицах после обновления скрипта."
	]]);
	var root_24 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		" "
	]]);
	var root_25 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Существующих скрытых отладочных кнопок не найдено."
	]]);
	var root_26 = /* @__PURE__ */ from_tree([
		[
			"button",
			{ class: "text-button" },
			"Вернуть исходный вид"
		],
		" ",
		,
	], 1);
	var root_27 = /* @__PURE__ */ from_tree([
		[
			"button",
			{ class: "text-button" },
			" "
		],
		" ",
		,
	], 1);
	var root_28 = /* @__PURE__ */ from_tree([
		[
			"p",
			{ class: "experiment-note" },
			"Показать существующие скрытые кнопки. Это меняет только видимость; команды могут быть не подключены."
		],
		" ",
		,
	], 1);
	var root_29 = /* @__PURE__ */ from_tree([[
		"div",
		null,
		["dt"],
		[
			"dd",
			null,
			" "
		]
	]]);
	var root_30 = /* @__PURE__ */ from_tree([
		[
			"p",
			{ class: "experiment-note" },
			" "
		],
		" ",
		["dl", { class: "metric-list" }]
	], 1);
	var root_31 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		"Google не передал CacheSizes."
	]]);
	var root_32 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "experiment-note" },
		" "
	]]);
	var root_33 = /* @__PURE__ */ from_tree([[
		"details",
		{ class: "experiment-group" },
		[
			"summary",
			null,
			" ",
			,
		],
		" ",
		[
			"div",
			{ class: "experiment-tool-body" },
			[
				"div",
				{ class: "experiment-context" },
				[
					"span",
					null,
					"Что это"
				],
				,
			],
			" ",
			,
		]
	]]);
	var root_34 = /* @__PURE__ */ from_tree([
		[
			"details",
			{
				class: "experiment-group",
				open: ""
			},
			[
				"summary",
				null,
				"Этапы и загрузка",
				,
			],
			" ",
			[
				"dl",
				{ class: "metric-list" },
				[
					"div",
					null,
					[
						"dt",
						null,
						"Сигнал Worker",
						,
					],
					[
						"dd",
						null,
						" "
					]
				],
				" ",
				[
					"div",
					null,
					[
						"dt",
						null,
						"Оценка объёма",
						,
					],
					[
						"dd",
						null,
						" "
					]
				],
				" ",
				[
					"div",
					null,
					[
						"dt",
						null,
						"Получение Wasm",
						,
					],
					[
						"dd",
						null,
						" "
					]
				],
				" ",
				[
					"div",
					null,
					[
						"dt",
						null,
						"Создание Wasm",
						,
					],
					[
						"dd",
						null,
						" "
					]
				],
				" ",
				[
					"div",
					null,
					[
						"dt",
						null,
						"Инициализация",
						,
					],
					[
						"dd",
						null,
						" "
					]
				],
				" ",
				[
					"div",
					null,
					[
						"dt",
						null,
						"Ошибки создания",
						,
					],
					[
						"dd",
						null,
						" "
					]
				],
				" ",
				,
			],
			" ",
			[
				"p",
				{ class: "experiment-note" },
				"Ожидание и применение результата: отдельные замеры пока недоступны."
			]
		],
		" ",
		,
	], 1);
	var root_35 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
		" ",
		,
		" ",
		,
		" ",
		,
	], 1);
	var root_36 = /* @__PURE__ */ from_tree([[
		"div",
		{ class: "panel-tabs experimental-panel" },
		[
			"div",
			{ class: "experiment-heading" },
			[
				"button",
				{ class: "text-button experiment-back" },
				,
				" Основной"
			],
			" ",
			[
				"span",
				null,
				" "
			]
		],
		" ",
		,
	]]);
	function ExperimentalPanel($$anchor, $$props) {
		push($$props, true);
		let tab = /* @__PURE__ */ state("metrics");
		let phase = /* @__PURE__ */ state("all");
		const number = (value) => value == null ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
		let data = /* @__PURE__ */ user_derived(() => $$props.model.experimental);
		let phases = /* @__PURE__ */ user_derived(() => get$2(data)?.phases ?? []);
		let items = /* @__PURE__ */ user_derived(() => [{
			value: "all",
			label: "Все фазы расчёта"
		}, ...get$2(phases).map((item) => ({
			value: String(item.index),
			label: `${item.index + 1} · ${experimentalPhaseName(item.type)}`
		}))]);
		let selected = /* @__PURE__ */ user_derived(() => get$2(items).find((item) => item.value === get$2(phase)) ?? get$2(items)[0]);
		let shown = /* @__PURE__ */ user_derived(() => get$2(selected).value === "all" ? get$2(phases) : get$2(phases).filter((item) => String(item.index) === get$2(selected).value));
		let summary = /* @__PURE__ */ user_derived(() => summarizeMetrics(get$2(shown)));
		let functions = /* @__PURE__ */ user_derived(() => (get$2(data)?.functions ?? []).flatMap((group) => group.entries.map((entry) => ({
			...entry,
			type: group.type
		}))).sort((a, b) => b.count - a.count));
		let tools = /* @__PURE__ */ user_derived(() => $$props.model.experimentalTools);
		let signals = /* @__PURE__ */ user_derived(() => $$props.model.experimentalSignals ?? {});
		let received = /* @__PURE__ */ user_derived(() => get$2(data)?.updatedAt ? new Date(get$2(data).updatedAt).toLocaleTimeString("ru-RU", {
			hour: "2-digit",
			minute: "2-digit"
		}) : null);
		var div = root_36();
		var div_1 = child(div);
		var button = child(div_1);
		Arrow_left(child(button), { size: 13 });
		next$1();
		reset(button);
		var text$2 = only_child(sibling(button, 2), true);
		reset(div_1);
		component(sibling(div_1, 2), () => Tabs, ($$anchor, Tabs_Root) => {
			Tabs_Root($$anchor, {
				class: "panel-tabs",
				get value() {
					return get$2(tab);
				},
				set value($$value) {
					set(tab, $$value, true);
				},
				children: ($$anchor, $$slotProps) => {
					var fragment = root_35();
					var node_2 = first_child(fragment);
					component(node_2, () => Tabs_list, ($$anchor, Tabs_List) => {
						Tabs_List($$anchor, {
							class: "ui-tabs experiment-tabs",
							"aria-label": "Экспериментальные функции",
							children: ($$anchor, $$slotProps) => {
								var fragment_1 = root$2();
								var node_3 = first_child(fragment_1);
								component(node_3, () => Tabs_trigger, ($$anchor, Tabs_Trigger) => {
									Tabs_Trigger($$anchor, {
										class: "ui-tab",
										value: "metrics",
										children: ($$anchor, $$slotProps) => {
											next$1();
											append($$anchor, text("Счётчики"));
										},
										$$slots: { default: true }
									});
								});
								var node_4 = sibling(node_3, 2);
								component(node_4, () => Tabs_trigger, ($$anchor, Tabs_Trigger_1) => {
									Tabs_Trigger_1($$anchor, {
										class: "ui-tab",
										value: "functions",
										children: ($$anchor, $$slotProps) => {
											next$1();
											append($$anchor, text("Функции"));
										},
										$$slots: { default: true }
									});
								});
								var node_5 = sibling(node_4, 2);
								component(node_5, () => Tabs_trigger, ($$anchor, Tabs_Trigger_2) => {
									Tabs_Trigger_2($$anchor, {
										class: "ui-tab",
										value: "relations",
										children: ($$anchor, $$slotProps) => {
											next$1();
											append($$anchor, text("Связи"));
										},
										$$slots: { default: true }
									});
								});
								var node_6 = sibling(node_5, 2);
								component(node_6, () => Tabs_trigger, ($$anchor, Tabs_Trigger_3) => {
									Tabs_Trigger_3($$anchor, {
										class: "ui-tab",
										value: "tools",
										children: ($$anchor, $$slotProps) => {
											next$1();
											append($$anchor, text("Инструменты"));
										},
										$$slots: { default: true }
									});
								});
								SelectionIndicator(sibling(node_6, 2), {
									selector: "[role=\"tab\"][data-state=\"active\"]",
									get active() {
										return get$2(tab);
									}
								});
								append($$anchor, fragment_1);
							},
							$$slots: { default: true }
						});
					});
					var node_8 = sibling(node_2, 2);
					component(node_8, () => Tabs_content, ($$anchor, Tabs_Content) => {
						Tabs_Content($$anchor, {
							class: "relations-content",
							value: "relations",
							children: ($$anchor, $$slotProps) => {
								var fragment_2 = comment();
								var node_9 = first_child(fragment_2);
								var consequent = ($$anchor) => {
									RelationsPanel($$anchor, { get model() {
										return $$props.model;
									} });
								};
								if_block(node_9, ($$render) => {
									if (get$2(tab) === "relations" && $$props.model.panelOpen) $$render(consequent);
								});
								append($$anchor, fragment_2);
							},
							$$slots: { default: true }
						});
					});
					var node_10 = sibling(node_8, 2);
					component(node_10, () => Tabs_content, ($$anchor, Tabs_Content_1) => {
						Tabs_Content_1($$anchor, {
							class: "experiment-content",
							value: "metrics",
							children: ($$anchor, $$slotProps) => {
								var fragment_4 = root_10();
								var div_2 = first_child(fragment_4);
								var node_11 = child(div_2);
								component(node_11, () => Select, ($$anchor, Select_Root) => {
									Select_Root($$anchor, {
										type: "single",
										get items() {
											return get$2(items);
										},
										allowDeselect: false,
										get value() {
											return get$2(phase);
										},
										set value($$value) {
											set(phase, $$value, true);
										},
										children: ($$anchor, $$slotProps) => {
											var fragment_5 = root_3$1();
											var node_12 = first_child(fragment_5);
											component(node_12, () => Select_trigger, ($$anchor, Select_Trigger) => {
												Select_Trigger($$anchor, {
													class: "period-select",
													"aria-label": "Фаза экспериментальных метрик",
													children: ($$anchor, $$slotProps) => {
														next$1();
														var fragment_6 = root_1$2();
														var text_5 = first_child(fragment_6, true);
														Chevron_down(sibling(text_5), { size: 12 });
														template_effect(() => set_text(text_5, get$2(selected).label));
														append($$anchor, fragment_6);
													},
													$$slots: { default: true }
												});
											});
											component(sibling(node_12, 2), () => Portal, ($$anchor, Select_Portal) => {
												Select_Portal($$anchor, {
													children: ($$anchor, $$slotProps) => {
														var fragment_7 = comment();
														component(first_child(fragment_7), () => Select_content, ($$anchor, Select_Content) => {
															Select_Content($$anchor, {
																class: "ui-select-menu",
																sideOffset: 6,
																children: ($$anchor, $$slotProps) => {
																	var fragment_8 = comment();
																	component(first_child(fragment_8), () => Select_viewport, ($$anchor, Select_Viewport) => {
																		Select_Viewport($$anchor, {
																			children: ($$anchor, $$slotProps) => {
																				var fragment_9 = comment();
																				each(first_child(fragment_9), 17, () => get$2(items), (item) => item.value, ($$anchor, item) => {
																					var fragment_10 = comment();
																					var node_18 = first_child(fragment_10);
																					{
																						const children = ($$anchor, $$arg0) => {
																							let selected = () => ($$arg0?.()).selected;
																							var fragment_11 = root_2$2();
																							var span_1 = first_child(fragment_11);
																							var text_6 = only_child(span_1, true);
																							var node_19 = sibling(span_1);
																							var consequent_1 = ($$anchor) => {
																								Check($$anchor, { size: 12 });
																							};
																							if_block(node_19, ($$render) => {
																								if (selected()) $$render(consequent_1);
																							});
																							template_effect(() => set_text(text_6, get$2(item).label));
																							append($$anchor, fragment_11);
																						};
																						component(node_18, () => Select_item, ($$anchor, Select_Item) => {
																							Select_Item($$anchor, {
																								class: "ui-select-item",
																								get value() {
																									return get$2(item).value;
																								},
																								get label() {
																									return get$2(item).label;
																								},
																								children,
																								$$slots: { default: true }
																							});
																						});
																					}
																					append($$anchor, fragment_10);
																				});
																				append($$anchor, fragment_9);
																			},
																			$$slots: { default: true }
																		});
																	});
																	append($$anchor, fragment_8);
																},
																$$slots: { default: true }
															});
														});
														append($$anchor, fragment_7);
													},
													$$slots: { default: true }
												});
											});
											append($$anchor, fragment_5);
										},
										$$slots: { default: true }
									});
								});
								MetricHelp(sibling(node_11, 2), {
									label: "Область метрик",
									text: "Агрегаты последнего native-снимка, включая зависимые листы. Не показатели выбранной ячейки. Пакеты могут повторять накопленные числа, поэтому здесь нет суммы за сессию. Неполная сумма помечена звёздочкой."
								});
								reset(div_2);
								var node_21 = sibling(div_2, 2);
								var consequent_2 = ($$anchor) => {
									append($$anchor, root_4$1());
								};
								if_block(node_21, ($$render) => {
									if (!get$2(data)) $$render(consequent_2);
								});
								var node_22 = sibling(node_21, 2);
								var consequent_3 = ($$anchor) => {
									var p_1 = root_5$1();
									var text_7 = only_child(p_1, true);
									template_effect(() => set_text(text_7, get$2(data).error));
									append($$anchor, p_1);
								};
								if_block(node_22, ($$render) => {
									if (get$2(data)?.error) $$render(consequent_3);
								});
								var node_23 = sibling(node_22, 2);
								var consequent_4 = ($$anchor) => {
									var p_2 = root_6$1();
									p_2.textContent = "Движок Google обновился и ещё не сверён с проверенным. Счётчики показаны по прежней схеме полей: их смысл мог измениться.";
									append($$anchor, p_2);
								};
								if_block(node_23, ($$render) => {
									if (get$2(data)?.engineVerified === false) $$render(consequent_4);
								});
								each(sibling(node_23, 2), 19, () => metricGroups, (group) => group.id, ($$anchor, group, index) => {
									var details = root_9();
									var summary_1 = child(details);
									var text_8 = child(summary_1, true);
									Chevron_down(sibling(text_8), { size: 13 });
									reset(summary_1);
									var dl = sibling(summary_1, 2);
									each(dl, 21, () => metrics.filter((metric) => metric.group === get$2(group).id), (metric) => metric.id, ($$anchor, metric) => {
										var div_3 = root_8();
										var dt = child(div_3);
										var text_9 = child(dt, true);
										var node_26 = sibling(text_9);
										{
											let $0 = /* @__PURE__ */ user_derived(() => get$2(metric).help + " — означает, что Google не передал безопасное числовое значение. * — сумма только фаз, в которых показатель доступен.");
											MetricHelp(node_26, {
												get label() {
													return get$2(metric).label;
												},
												get text() {
													return get$2($0);
												}
											});
										}
										reset(dt);
										var dd = sibling(dt, 2);
										var text_10 = child(dd, true);
										var node_27 = sibling(text_10);
										var consequent_5 = ($$anchor) => {
											append($$anchor, root_7());
										};
										if_block(node_27, ($$render) => {
											if (get$2(summary)[get$2(metric).id].partial) $$render(consequent_5);
										});
										reset(dd);
										reset(div_3);
										template_effect(($0) => {
											set_text(text_9, get$2(metric).label);
											set_text(text_10, $0);
										}, [() => number(get$2(summary)[get$2(metric).id].value)]);
										append($$anchor, div_3);
									});
									reset(dl);
									reset(details);
									template_effect(() => {
										details.open = get$2(index) < 2;
										set_text(text_8, get$2(group).label);
									});
									append($$anchor, details);
								});
								next$1(2);
								append($$anchor, fragment_4);
							},
							$$slots: { default: true }
						});
					});
					var node_28 = sibling(node_10, 2);
					component(node_28, () => Tabs_content, ($$anchor, Tabs_Content_2) => {
						Tabs_Content_2($$anchor, {
							class: "experiment-content",
							value: "functions",
							children: ($$anchor, $$slotProps) => {
								var fragment_13 = root_16();
								var div_4 = first_child(fragment_13);
								MetricHelp(sibling(child(div_4)), {
									label: "Частоты функций",
									text: "Количество срабатываний в инструментированных путях движка. Есть служебные имена. Это не полный счётчик операций и не время функции; адресной привязки нет. Сбор зависит от отдельной настройки Google, не только от таймеров."
								});
								reset(div_4);
								var node_30 = sibling(div_4, 2);
								var consequent_6 = ($$anchor) => {
									var ol = root_12();
									each(ol, 23, () => get$2(functions), (entry, index) => `${entry.type}:${entry.name}:${index}`, ($$anchor, entry) => {
										var li = root_11();
										var div_5 = child(li);
										var code = child(div_5);
										var text_11 = only_child(code, true);
										var text_12 = only_child(sibling(code), true);
										reset(div_5);
										var text_13 = only_child(sibling(div_5), true);
										reset(li);
										template_effect(($0, $1) => {
											set_text(text_11, get$2(entry).name);
											set_text(text_12, $0);
											set_text(text_13, $1);
										}, [() => experimentalPhaseName(get$2(entry).type), () => number(get$2(entry).count)]);
										append($$anchor, li);
									});
									reset(ol);
									append($$anchor, ol);
								};
								var alternate = ($$anchor) => {
									var p_3 = root_13();
									var text_14 = only_child(p_3);
									template_effect(($0) => set_text(text_14, `${$0 ?? ""} Настройки движка автоматически не меняются.`), [() => get$2(data)?.functions?.some((group) => group.available) ? "В снимке нет записей частот." : "Google не передал частоты функций."]);
									append($$anchor, p_3);
								};
								if_block(node_30, ($$render) => {
									if (get$2(functions).length) $$render(consequent_6);
									else $$render(alternate, -1);
								});
								var node_31 = sibling(node_30, 2);
								var consequent_7 = ($$anchor) => {
									var p_4 = root_14();
									p_4.textContent = "Движок Google обновился и ещё не сверён с проверенным. Счётчики показаны по прежней схеме полей: их смысл мог измениться.";
									append($$anchor, p_4);
								};
								if_block(node_31, ($$render) => {
									if (get$2(data)?.engineVerified === false) $$render(consequent_7);
								});
								var node_32 = sibling(node_31, 2);
								var consequent_8 = ($$anchor) => {
									append($$anchor, root_15());
								};
								var d = /* @__PURE__ */ user_derived(() => get$2(data)?.functions?.some((group) => group.malformed));
								if_block(node_32, ($$render) => {
									if (get$2(d)) $$render(consequent_8);
								});
								append($$anchor, fragment_13);
							},
							$$slots: { default: true }
						});
					});
					component(sibling(node_28, 2), () => Tabs_content, ($$anchor, Tabs_Content_3) => {
						Tabs_Content_3($$anchor, {
							class: "experiment-content",
							value: "tools",
							children: ($$anchor, $$slotProps) => {
								var fragment_14 = root_34();
								var details_1 = first_child(fragment_14);
								var summary_2 = child(details_1);
								Chevron_down(sibling(child(summary_2)), { size: 13 });
								reset(summary_2);
								var dl_1 = sibling(summary_2, 2);
								var div_6 = child(dl_1);
								var dt_1 = child(div_6);
								MetricHelp(sibling(child(dt_1)), {
									label: "Прогресс",
									text: "Последний полученный сигнал расчёта. Процент относится к очереди Google, а не только к выбранному листу. Он не доказывает завершение отрисовки или сохранения."
								});
								reset(dt_1);
								var text_15 = only_child(sibling(dt_1), true);
								reset(div_6);
								var div_7 = sibling(div_6, 2);
								var dt_2 = child(div_7);
								MetricHelp(sibling(child(dt_2)), {
									label: "Оценка объёма",
									text: "numDirtyCellsEstimate из сигнала прогресса. Это оценка предстоящей работы, не точное число операций."
								});
								reset(dt_2);
								var text_16 = only_child(sibling(dt_2), true);
								reset(div_7);
								var div_8 = sibling(div_7, 2);
								var dt_3 = child(div_8);
								MetricHelp(sibling(child(dt_3)), {
									label: "Получение Wasm",
									text: "Разность нативных отметок начала и завершения получения Wasm. Производная длительность старта, не время формул."
								});
								reset(dt_3);
								var text_17 = only_child(sibling(dt_3), true);
								reset(div_8);
								var div_9 = sibling(div_8, 2);
								var dt_4 = child(div_9);
								MetricHelp(sibling(child(dt_4)), {
									label: "Создание Wasm",
									text: "Нативная длительность instantiateStreaming при запуске движка. Если подключились поздно, данных может не быть."
								});
								reset(dt_4);
								var text_18 = only_child(sibling(dt_4), true);
								reset(div_9);
								var div_10 = sibling(div_9, 2);
								var dt_5 = child(div_10);
								MetricHelp(sibling(child(dt_5)), {
									label: "Инициализация",
									text: "Нативная длительность начальной инициализации Worker. Не полное время загрузки таблицы."
								});
								reset(dt_5);
								var text_19 = only_child(sibling(dt_5), true);
								reset(div_10);
								var div_11 = sibling(div_10, 2);
								var dt_6 = child(div_11);
								MetricHelp(sibling(child(dt_6)), {
									label: "Ошибки создания",
									text: "Число неудачных попыток инстанцирования Wasm при старте. Отсутствие поля не равно нулю."
								});
								reset(dt_6);
								var text_20 = only_child(sibling(dt_6), true);
								reset(div_11);
								each(sibling(div_11, 2), 17, () => get$2(phases), (item) => item.index, ($$anchor, item) => {
									var div_12 = root_17();
									var dt_7 = child(div_12);
									var text_21 = child(dt_7, true);
									var node_42 = sibling(text_21);
									{
										let $0 = /* @__PURE__ */ user_derived(() => experimentalPhaseName(get$2(item).type));
										MetricHelp(node_42, {
											get label() {
												return get$2($0);
											},
											text: "Нативное время фазы последнего снимка. Ожидание очереди и применение результатов сюда автоматически не добавляются."
										});
									}
									reset(dt_7);
									var text_22 = only_child(sibling(dt_7), true);
									reset(div_12);
									template_effect(($0, $1) => {
										set_text(text_21, $0);
										set_text(text_22, $1);
									}, [() => experimentalPhaseName(get$2(item).type), () => formatTime(get$2(item).elapsedMs)]);
									append($$anchor, div_12);
								});
								reset(dl_1);
								next$1(2);
								reset(details_1);
								each(sibling(details_1, 2), 17, () => experimentalTools, (tool) => tool.id, ($$anchor, tool) => {
									var details_2 = root_33();
									var summary_3 = child(details_2);
									var text_23 = child(summary_3, true);
									Chevron_down(sibling(text_23), { size: 13 });
									reset(summary_3);
									var div_13 = sibling(summary_3, 2);
									var div_14 = child(div_13);
									MetricHelp(sibling(child(div_14)), {
										get label() {
											return get$2(tool).label;
										},
										get text() {
											return get$2(tool).help;
										}
									});
									reset(div_14);
									var node_46 = sibling(div_14, 2);
									var consequent_11 = ($$anchor) => {
										var fragment_15 = comment();
										var node_47 = first_child(fragment_15);
										var consequent_10 = ($$anchor) => {
											var fragment_16 = root_20();
											var node_48 = sibling(first_child(fragment_16), 2);
											each(node_48, 17, () => get$2(tools).latency.entries, (entry) => entry.name, ($$anchor, entry) => {
												var div_15 = root_18();
												var code_1 = child(div_15);
												var text_24 = only_child(code_1, true);
												var text_25 = only_child(sibling(code_1), true);
												reset(div_15);
												template_effect(($0) => {
													set_text(text_24, get$2(entry).name);
													set_text(text_25, $0);
												}, [() => get$2(entry).values.map((value) => String(value)).join(" · ")]);
												append($$anchor, div_15);
											});
											var node_49 = sibling(node_48, 2);
											var consequent_9 = ($$anchor) => {
												append($$anchor, root_19());
											};
											if_block(node_49, ($$render) => {
												if (get$2(tools).latency.truncated) $$render(consequent_9);
											});
											append($$anchor, fragment_16);
										};
										var alternate_1 = ($$anchor) => {
											var p_7 = root_21();
											var text_26 = only_child(p_7, true);
											template_effect(() => set_text(text_26, get$2(tools)?.latency?.reason ?? "Журнал недоступен"));
											append($$anchor, p_7);
										};
										if_block(node_47, ($$render) => {
											if (get$2(tools)?.latency?.entries?.length) $$render(consequent_10);
											else $$render(alternate_1, -1);
										});
										append($$anchor, fragment_15);
									};
									var consequent_12 = ($$anchor) => {
										var fragment_17 = root_22();
										var p_8 = first_child(fragment_17);
										var text_27 = only_child(p_8, true);
										var p_9 = sibling(p_8, 2);
										var text_28 = only_child(p_9, true);
										var button_1 = sibling(p_9, 2);
										template_effect(($0) => {
											set_text(text_27, $0);
											set_text(text_28, get$2(tools)?.modelSize?.reason ?? "Из кэша панели Google · время получения неизвестно");
										}, [() => get$2(tools)?.modelSize?.bytes == null ? "—" : number(get$2(tools).modelSize.bytes) + " Б"]);
										delegated("click", button_1, () => $$props.model.openGoogle());
										append($$anchor, fragment_17);
									};
									var consequent_15 = ($$anchor) => {
										var fragment_18 = root_28();
										var node_50 = sibling(first_child(fragment_18), 2);
										var consequent_13 = ($$anchor) => {
											append($$anchor, root_23());
										};
										var alternate_2 = ($$anchor) => {
											var fragment_19 = root_27();
											var button_2 = first_child(fragment_19);
											var text_29 = only_child(button_2, true);
											var node_51 = sibling(button_2, 2);
											var consequent_14 = ($$anchor) => {
												var fragment_20 = root_26();
												var button_3 = first_child(fragment_20);
												each(sibling(button_3, 2), 17, () => $$props.model.debugControls.controls, (control) => control.id, ($$anchor, control) => {
													var p_11 = root_24();
													var text_30 = only_child(p_11);
													template_effect(() => set_text(text_30, `${get$2(control).label ?? ""} · ${get$2(control).visible ? "показано" : "скрыто родительским элементом"}`));
													append($$anchor, p_11);
												}, ($$anchor) => {
													append($$anchor, root_25());
												});
												delegated("click", button_3, () => $$props.model.revealDebugControls(false));
												append($$anchor, fragment_20);
											};
											if_block(node_51, ($$render) => {
												if ($$props.model.debugControls.enabled) $$render(consequent_14);
											});
											template_effect(() => set_text(text_29, $$props.model.debugControls.enabled ? "Найти ещё" : "Показать скрытые кнопки"));
											delegated("click", button_2, () => $$props.model.revealDebugControls(true));
											append($$anchor, fragment_19);
										};
										if_block(node_50, ($$render) => {
											if ($$props.model.isDemo) $$render(consequent_13);
											else $$render(alternate_2, -1);
										});
										append($$anchor, fragment_18);
									};
									var consequent_16 = ($$anchor) => {
										var fragment_21 = comment();
										each(first_child(fragment_21), 17, () => get$2(phases).filter((item) => item.cache), (item) => item.index, ($$anchor, item) => {
											var fragment_22 = root_30();
											var p_13 = first_child(fragment_22);
											var text_31 = only_child(p_13);
											var dl_2 = sibling(p_13, 2);
											each(dl_2, 21, () => get$2(item).cache, index$1, ($$anchor, value, index) => {
												var div_16 = root_29();
												var dt_8 = child(div_16);
												dt_8.textContent = `Поле ${index + 1}`;
												var text_32 = only_child(sibling(dt_8), true);
												reset(div_16);
												template_effect(($0) => set_text(text_32, $0), [() => Array.isArray(get$2(value)) ? get$2(value).map(number).join(" · ") || "Пустой список" : number(get$2(value))]);
												append($$anchor, div_16);
											});
											reset(dl_2);
											template_effect(($0) => set_text(text_31, `${$0 ?? ""} · единицы неизвестны`), [() => experimentalPhaseName(get$2(item).type)]);
											append($$anchor, fragment_22);
										}, ($$anchor) => {
											append($$anchor, root_31());
										});
										append($$anchor, fragment_21);
									};
									var alternate_3 = ($$anchor) => {
										var p_15 = root_32();
										var text_33 = only_child(p_15, true);
										template_effect(() => set_text(text_33, get$2(tool).reason));
										append($$anchor, p_15);
									};
									if_block(node_46, ($$render) => {
										if (get$2(tool).id === "latency") $$render(consequent_11);
										else if (get$2(tool).id === "modelSize") $$render(consequent_12, 1);
										else if (get$2(tool).id === "debug") $$render(consequent_15, 2);
										else if (get$2(tool).id === "cache") $$render(consequent_16, 3);
										else $$render(alternate_3, -1);
									});
									reset(div_13);
									reset(details_2);
									template_effect(() => set_text(text_23, get$2(tool).label));
									append($$anchor, details_2);
								});
								template_effect(($0, $1, $2, $3, $4, $5) => {
									set_text(text_15, $0);
									set_text(text_16, $1);
									set_text(text_17, $2);
									set_text(text_18, $3);
									set_text(text_19, $4);
									set_text(text_20, $5);
								}, [
									() => get$2(signals).progress?.percent == null ? "—" : number(get$2(signals).progress.percent) + "%",
									() => number(get$2(signals).progress?.dirtyEstimate),
									() => formatTime(get$2(signals).startup?.fetchMs),
									() => formatTime(get$2(signals).startup?.instantiateMs),
									() => formatTime(get$2(signals).startup?.initializeMs),
									() => number(get$2(signals).startup?.failures)
								]);
								append($$anchor, fragment_14);
							},
							$$slots: { default: true }
						});
					});
					append($$anchor, fragment);
				},
				$$slots: { default: true }
			});
		});
		reset(div);
		template_effect(() => set_text(text$2, $$props.model.isDemo ? "Демо-данные" : get$2(tab) === "relations" ? "По выбранной ячейке" : `Последний снимок${get$2(received) ? " · " + get$2(received) : ""}`));
		delegated("click", button, () => $$props.model.setExperimental(false));
		append($$anchor, div);
		pop();
	}
	delegate(["click"]);
	//#endregion
	//#region userscript/src/ui/EfficiencyPanel.svelte
	var root$1 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
		" ",
		,
	], 1);
	var root_1$1 = /* @__PURE__ */ from_tree([[
		"p",
		{ class: "empty-cells" },
		"Запустите расчёт, чтобы увидеть время."
	]]);
	var root_2$1 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	var root_3 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	var root_4 = /* @__PURE__ */ from_tree([
		[
			"div",
			{ class: "tabs-line" },
			,
			" ",
			,
		],
		" ",
		,
		" ",
		,
	], 1);
	var root_5 = /* @__PURE__ */ from_tree([
		,
		,
		" ",
		,
	], 1);
	var root_6 = /* @__PURE__ */ from_tree([[
		"section",
		{
			class: "scope-panel overview",
			"aria-label": "Эффективность таблицы"
		},
		,
		" ",
		,
		" ",
		,
	]]);
	function EfficiencyPanel($$anchor, $$props) {
		push($$props, true);
		let tab = /* @__PURE__ */ state("cells");
		let all = /* @__PURE__ */ state(false);
		let type = /* @__PURE__ */ state("all");
		var section = root_6();
		var node = child(section);
		Controls(node, { get model() {
			return $$props.model;
		} });
		var node_1 = sibling(node, 2);
		var consequent = ($$anchor) => {
			ExperimentalPanel($$anchor, { get model() {
				return $$props.model;
			} });
		};
		var alternate_1 = ($$anchor) => {
			var fragment_1 = root_5();
			var node_2 = first_child(fragment_1);
			ResultPeriod(node_2, { get model() {
				return $$props.model;
			} });
			component(sibling(node_2, 2), () => Tabs, ($$anchor, Tabs_Root) => {
				Tabs_Root($$anchor, {
					class: "panel-tabs",
					get value() {
						return get$2(tab);
					},
					set value($$value) {
						set(tab, $$value, true);
					},
					children: ($$anchor, $$slotProps) => {
						var fragment_2 = root_4();
						var div = first_child(fragment_2);
						var node_4 = child(div);
						component(node_4, () => Tabs_list, ($$anchor, Tabs_List) => {
							Tabs_List($$anchor, {
								class: "ui-tabs",
								"aria-label": "Результаты",
								children: ($$anchor, $$slotProps) => {
									var fragment_3 = root$1();
									var node_5 = first_child(fragment_3);
									component(node_5, () => Tabs_trigger, ($$anchor, Tabs_Trigger) => {
										Tabs_Trigger($$anchor, {
											class: "ui-tab",
											value: "result",
											children: ($$anchor, $$slotProps) => {
												next$1();
												append($$anchor, text("Результат"));
											},
											$$slots: { default: true }
										});
									});
									var node_6 = sibling(node_5, 2);
									component(node_6, () => Tabs_trigger, ($$anchor, Tabs_Trigger_1) => {
										Tabs_Trigger_1($$anchor, {
											class: "ui-tab",
											value: "cells",
											children: ($$anchor, $$slotProps) => {
												next$1();
												append($$anchor, text("Эффективность"));
											},
											$$slots: { default: true }
										});
									});
									SelectionIndicator(sibling(node_6, 2), {
										selector: "[role=\"tab\"][data-state=\"active\"]",
										get active() {
											return get$2(tab);
										}
									});
									append($$anchor, fragment_3);
								},
								$$slots: { default: true }
							});
						});
						var node_8 = sibling(node_4, 2);
						var consequent_1 = ($$anchor) => {
							TypeFilter($$anchor, {
								get value() {
									return get$2(type);
								},
								set value($$value) {
									set(type, $$value, true);
								}
							});
						};
						if_block(node_8, ($$render) => {
							if (get$2(tab) === "cells") $$render(consequent_1);
						});
						reset(div);
						var node_9 = sibling(div, 2);
						component(node_9, () => Tabs_content, ($$anchor, Tabs_Content) => {
							Tabs_Content($$anchor, {
								value: "result",
								class: "panel-content result-content",
								children: ($$anchor, $$slotProps) => {
									var fragment_5 = root_2$1();
									var node_10 = first_child(fragment_5);
									var consequent_2 = ($$anchor) => {
										PhaseChart($$anchor, { get phases() {
											return $$props.model.phases;
										} });
									};
									var alternate = ($$anchor) => {
										append($$anchor, root_1$1());
									};
									if_block(node_10, ($$render) => {
										if ($$props.model.hasResults !== false) $$render(consequent_2);
										else $$render(alternate, -1);
									});
									CellCapacity(sibling(node_10, 2), {
										get count() {
											return $$props.model.cellCapacity.count;
										},
										get limit() {
											return $$props.model.cellCapacity.limit;
										}
									});
									append($$anchor, fragment_5);
								},
								$$slots: { default: true }
							});
						});
						component(sibling(node_9, 2), () => Tabs_content, ($$anchor, Tabs_Content_1) => {
							Tabs_Content_1($$anchor, {
								value: "cells",
								class: "panel-content cells-content",
								children: ($$anchor, $$slotProps) => {
									var fragment_7 = root_3();
									var node_13 = first_child(fragment_7);
									CellScope(node_13, {
										get model() {
											return $$props.model;
										},
										get all() {
											return get$2(all);
										},
										set all($$value) {
											set(all, $$value, true);
										}
									});
									CellList(sibling(node_13, 2), {
										get model() {
											return $$props.model;
										},
										get all() {
											return get$2(all);
										},
										get type() {
											return get$2(type);
										}
									});
									append($$anchor, fragment_7);
								},
								$$slots: { default: true }
							});
						});
						append($$anchor, fragment_2);
					},
					$$slots: { default: true }
				});
			});
			append($$anchor, fragment_1);
		};
		if_block(node_1, ($$render) => {
			if ($$props.model.experimentalOpen) $$render(consequent);
			else $$render(alternate_1, -1);
		});
		PanelFooter(sibling(node_1, 2), {});
		reset(section);
		append($$anchor, section);
		pop();
	}
	//#endregion
	//#region userscript/src/Surface.svelte
	function Surface($$anchor, $$props) {
		Bits_config($$anchor, {
			get defaultPortalTo() {
				return $$props.portal;
			},
			children: ($$anchor, $$slotProps) => {
				EfficiencyPanel($$anchor, { get model() {
					return $$props.model;
				} });
			},
			$$slots: { default: true }
		});
	}
	//#endregion
	//#region userscript/src/ui/diffusion.js
	var diffusionDots = Array.from({ length: 49 }, (_, index) => {
		const row = Math.floor(index / 7);
		const col = index % 7;
		return {
			key: index,
			row,
			col,
			rest: .18 + (row * 11 + col * 7) % 5 * .035
		};
	}).filter(({ row, col }) => (row - 3) ** 2 + (col - 3) ** 2 <= 10);
	function startDiffusion(matrix) {
		const lights = [...matrix.querySelectorAll("i > b")];
		if (lights.length !== diffusionDots.length || !lights[0]?.animate) return () => {};
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		const active = /* @__PURE__ */ new Set();
		const animations = /* @__PURE__ */ new Set();
		let timer;
		let running = false;
		function tick() {
			if (!running) return;
			const candidates = diffusionDots.map((_, index) => index).filter((index) => !active.has(index));
			for (let index = candidates.length - 1; index > 0; index--) {
				const other = Math.floor(Math.random() * (index + 1));
				[candidates[index], candidates[other]] = [candidates[other], candidates[index]];
			}
			if (Math.random() < .6) {
				const center = diffusionDots[Math.floor(Math.random() * diffusionDots.length)];
				const scores = candidates.map((index) => ({
					index,
					value: (diffusionDots[index].row - center.row) ** 2 + (diffusionDots[index].col - center.col) ** 2 + Math.random() * 6
				}));
				scores.sort((a, b) => a.value - b.value);
				candidates.splice(0, candidates.length, ...scores.map((item) => item.index));
			}
			const wanted = Math.random() < .16 ? 6 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 5);
			const count = Math.min(wanted, candidates.length, Math.max(0, 15 - active.size));
			for (const index of candidates.slice(0, count)) {
				active.add(index);
				const rise = 220 + Math.random() * 140;
				const hold = 70 + Math.random() * 150;
				const duration = rise + hold + 470 + Math.random() * 220;
				const peak = .7 + Math.random() * .3;
				const animation = lights[index].animate([
					{
						offset: 0,
						opacity: 0
					},
					{
						offset: rise / duration,
						opacity: peak
					},
					{
						offset: (rise + hold) / duration,
						opacity: peak
					},
					{
						offset: 1,
						opacity: 0
					}
				], {
					duration,
					easing: "linear"
				});
				animations.add(animation);
				const done = () => {
					active.delete(index);
					animations.delete(animation);
					if (running && active.size === 0) {
						clearTimeout(timer);
						tick();
					}
				};
				animation.onfinish = done;
				animation.oncancel = done;
			}
			timer = setTimeout(tick, 115 + Math.random() * 160);
		}
		function pause() {
			running = false;
			clearTimeout(timer);
			animations.forEach((animation) => animation.cancel());
			animations.clear();
			active.clear();
		}
		function refresh() {
			if (reduced.matches || document.hidden) {
				pause();
				return;
			}
			if (!running) {
				running = true;
				tick();
			}
		}
		reduced.addEventListener("change", refresh);
		document.addEventListener("visibilitychange", refresh);
		refresh();
		return () => {
			reduced.removeEventListener("change", refresh);
			document.removeEventListener("visibilitychange", refresh);
			pause();
		};
	}
	//#endregion
	//#region userscript/src/ui/LauncherIcon.svelte
	var root = /* @__PURE__ */ from_tree([[
		"i",
		{ class: "scope-indicator-dot" },
		["b"]
	]]);
	var root_1 = /* @__PURE__ */ from_tree([[
		"span",
		{
			class: "scope-sr-only",
			role: "status"
		},
		"Идёт расчёт"
	]]);
	var root_2 = /* @__PURE__ */ from_tree([
		[
			"span",
			{
				class: "scope-indicator",
				"aria-hidden": "true"
			},
			[
				"span",
				{ class: "scope-indicator-idle" },
				,
			],
			" ",
			["span", { class: "scope-indicator-matrix" }]
		],
		" ",
		,
	], 1);
	function LauncherIcon($$anchor, $$props) {
		push($$props, true);
		let matrix = /* @__PURE__ */ state(null);
		user_effect(() => {
			if ($$props.model.running && get$2(matrix)) return startDiffusion(get$2(matrix));
		});
		var fragment = root_2();
		var span = first_child(fragment);
		var span_1 = child(span);
		Gauge(child(span_1), { "aria-hidden": "true" });
		reset(span_1);
		var span_2 = sibling(span_1, 2);
		each(span_2, 21, () => diffusionDots, (dot) => dot.key, ($$anchor, dot) => {
			var i = root();
			let styles;
			template_effect(() => styles = set_style(i, "", styles, {
				"grid-row": get$2(dot).row + 1,
				"grid-column": get$2(dot).col + 1,
				"--rest": get$2(dot).rest
			}));
			append($$anchor, i);
		});
		reset(span_2);
		bind_this(span_2, ($$value) => set(matrix, $$value), () => get$2(matrix));
		reset(span);
		var node_1 = sibling(span, 2);
		var consequent = ($$anchor) => {
			append($$anchor, root_1());
		};
		if_block(node_1, ($$render) => {
			if ($$props.model.running) $$render(consequent);
		});
		template_effect(() => set_attribute(span, "data-running", $$props.model.running));
		append($$anchor, fragment);
		pop();
	}
	//#endregion
	//#region userscript/src/live.svelte.js
	var clock = new Intl.DateTimeFormat("ru-RU", {
		hour: "2-digit",
		minute: "2-digit"
	});
	function sameRecords(previous, next) {
		if (previous === next) return true;
		if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) return false;
		for (let index = 0; index < next.length; index++) {
			const before = previous[index], after = next[index];
			if (before === after) continue;
			if (!before || !after || typeof before !== "object" || typeof after !== "object") return false;
			const keys = Object.keys(before);
			if (keys.length !== Object.keys(after).length || keys.some((key) => !Object.hasOwn(after, key) || !Object.is(before[key], after[key]))) return false;
		}
		return true;
	}
	var LiveModel = class {
		#sheet = /* @__PURE__ */ state("all");
		get sheet() {
			return get$2(this.#sheet);
		}
		set sheet(value) {
			set(this.#sheet, value, true);
		}
		#period = /* @__PURE__ */ state("last");
		get period() {
			return get$2(this.#period);
		}
		set period(value) {
			set(this.#period, value, true);
		}
		#snapshot = /* @__PURE__ */ state(null);
		get snapshot() {
			return get$2(this.#snapshot);
		}
		set snapshot(value) {
			set(this.#snapshot, value);
		}
		#presentedLast = /* @__PURE__ */ state([]);
		get presentedLast() {
			return get$2(this.#presentedLast);
		}
		set presentedLast(value) {
			set(this.#presentedLast, value);
		}
		#presentedSession = /* @__PURE__ */ state([]);
		get presentedSession() {
			return get$2(this.#presentedSession);
		}
		set presentedSession(value) {
			set(this.#presentedSession, value);
		}
		#sheets = /* @__PURE__ */ state([]);
		get sheets() {
			return get$2(this.#sheets);
		}
		set sheets(value) {
			set(this.#sheets, value);
		}
		#error = /* @__PURE__ */ state(null);
		get error() {
			return get$2(this.#error);
		}
		set error(value) {
			set(this.#error, value, true);
		}
		#action = /* @__PURE__ */ state(false);
		get action() {
			return get$2(this.#action);
		}
		set action(value) {
			set(this.#action, value, true);
		}
		#needsSetup = /* @__PURE__ */ state(false);
		get needsSetup() {
			return get$2(this.#needsSetup);
		}
		set needsSetup(value) {
			set(this.#needsSetup, value, true);
		}
		#calculatedSheet = /* @__PURE__ */ state("all");
		get calculatedSheet() {
			return get$2(this.#calculatedSheet);
		}
		set calculatedSheet(value) {
			set(this.#calculatedSheet, value, true);
		}
		#experimentalOpen = /* @__PURE__ */ state(false);
		get experimentalOpen() {
			return get$2(this.#experimentalOpen);
		}
		set experimentalOpen(value) {
			set(this.#experimentalOpen, value, true);
		}
		#relations = /* @__PURE__ */ state(null);
		get relations() {
			return get$2(this.#relations);
		}
		set relations(value) {
			set(this.#relations, value);
		}
		relationsWatching = false;
		stopRelations;
		watchRelations() {
			this.stopRelations?.();
			this.relationsWatching = true;
			const stop = watchRelations({
				selection: () => this.api.readSelection(),
				read: (selection) => this.api.readRelations(selection),
				publish: (result) => {
					this.relations = result;
				},
				active: () => !this.stopped && this.panelOpen && this.experimentalOpen
			});
			const cleanup = () => {
				stop();
				if (this.stopRelations === cleanup) {
					this.relationsWatching = false;
					this.stopRelations = null;
				}
			};
			this.stopRelations = cleanup;
			return cleanup;
		}
		#debugControls = /* @__PURE__ */ state({
			enabled: false,
			controls: []
		});
		get debugControls() {
			return get$2(this.#debugControls);
		}
		set debugControls(value) {
			set(this.#debugControls, value);
		}
		revealDebugControls(value) {
			try {
				this.debugControls = this.api.revealDebugControls(value);
			} catch (error) {
				this.error = error.message;
			}
		}
		#panelOpen = /* @__PURE__ */ state(false);
		get panelOpen() {
			return get$2(this.#panelOpen);
		}
		set panelOpen(value) {
			set(this.#panelOpen, value, true);
		}
		isDemo = false;
		timer;
		reading;
		stopped = false;
		activeSheet = null;
		lastScopeStamp = null;
		constructor(api, close) {
			this.api = api;
			this.close = close;
		}
		get running() {
			return this.action || this.snapshot?.request?.state === "waiting" || this.snapshot?.progressVisible === true;
		}
		get phases() {
			return (this.period === "session" ? this.snapshot?.session?.breakdown : this.snapshot?.breakdown) ?? [];
		}
		get cells() {
			return this.period === "session" ? this.presentedSession : this.presentedLast;
		}
		get hasResults() {
			return this.snapshot?.available === true;
		}
		get experimental() {
			return this.snapshot?.experimental ?? null;
		}
		get experimentalTools() {
			return this.snapshot?.experimentalTools ?? null;
		}
		get experimentalSignals() {
			return this.snapshot?.experimentalSignals ?? {};
		}
		setExperimental(value) {
			this.experimentalOpen = value;
			if (value && this.panelOpen) this.poll();
		}
		get cellCapacity() {
			return this.snapshot?.cellCapacity ?? {
				count: null,
				limit: null
			};
		}
		get updated() {
			return this.snapshot?.updatedAt ? clock.format(this.snapshot.updatedAt) : "—";
		}
		sheetName(id) {
			return id === "all" ? "Вся таблица" : this.sheets.find((item) => item.value === id)?.label ?? "Лист недоступен";
		}
		cellHref(cell) {
			return cellURL(cell, location.href);
		}
		navigate(cell) {
			try {
				navigateToCell(cell);
				this.close();
			} catch (error) {
				this.error = error.message;
			}
		}
		schedule() {
			clearTimeout(this.timer);
			if (!this.stopped && (this.panelOpen || this.running)) this.timer = setTimeout(() => this.poll(), 2e3);
		}
		async poll(followActive = false) {
			if (this.reading) {
				await this.reading;
				if (followActive && this.activeSheet) this.sheet = this.activeSheet;
				return;
			}
			this.reading = this.read(followActive);
			try {
				await this.reading;
			} finally {
				this.reading = null;
				this.schedule();
			}
		}
		async read(followActive) {
			try {
				const result = await this.api.read({ experimental: this.experimentalOpen });
				if (this.stopped) return;
				const observations = result.observations ?? [], sessionObservations = result.session?.observations ?? [];
				if (!sameRecords(this.snapshot?.observations ?? [], observations)) this.presentedLast = presentCells(observations);
				if (!sameRecords(this.snapshot?.session?.observations ?? [], sessionObservations)) this.presentedSession = presentCells(sessionObservations);
				if (!sameRecords(this.snapshot?.sheets, result.sheets)) this.sheets = result.sheets.map((sheet) => ({
					value: sheet.id,
					label: sheet.name
				}));
				this.snapshot = result;
				if (followActive || result.activeSheetId !== this.activeSheet) this.sheet = result.activeSheetId ?? "all";
				this.activeSheet = result.activeSheetId;
				if (this.sheet !== "all" && !this.sheets.some((sheet) => sheet.value === this.sheet)) this.sheet = this.activeSheet ?? "all";
				const stamp = result.sequence ?? result.updatedAt;
				if (stamp !== this.lastScopeStamp || result.request?.state === "new-result" && this.calculatedSheet === "all") {
					const matches = result.sequence == null ? result.request?.resultAt === result.updatedAt : result.request?.resultSequence === result.sequence;
					this.calculatedSheet = result.request?.state === "new-result" && matches ? result.request.sheetId ?? "all" : "all";
					this.lastScopeStamp = stamp;
				}
				const setup = this.api.status();
				this.needsSetup = ["disabled", "missed"].includes(setup.status);
				this.error = result.request?.state === "timeout" ? "Нет нового результата за 120 с. Автоматического повтора нет." : result.request?.state === "error" ? "Расчёт не запущен." : result.request?.state === "queued-without-measurements" ? `Пересчёт запущен. Замеры пока недоступны: ${result.request.measurementWarning}` : result.measurementError ?? setup.error ?? (setup.status === "waiting" ? "Ожидаем раннего подключения к вычислениям…" : null);
			} catch (error) {
				this.error = error.message;
			}
		}
		setOpen(open) {
			this.panelOpen = open;
			if (open) this.poll(true);
			else this.schedule();
		}
		async perform(callback) {
			if (this.action || this.stopped) return;
			this.action = true;
			this.error = null;
			try {
				await callback();
				if (this.reading) await this.reading;
				await this.poll();
			} catch (error) {
				this.error = error.message;
			} finally {
				this.action = false;
				this.schedule();
			}
		}
		recalculate() {
			if (!this.running) return this.perform(() => this.api.recalculate({ sheetId: this.sheet === "all" ? null : this.sheet }));
		}
		openGoogle() {
			return this.perform(() => this.api.open());
		}
		connect() {
			this.setTimers(true);
		}
		disconnect() {
			this.setTimers(false);
		}
		setTimers(value) {
			try {
				this.api.setEnabled(value);
				location.reload();
			} catch (error) {
				this.error = error.message;
			}
		}
		download() {
			if (!this.snapshot) {
				this.error = "Результаты ещё не получены.";
				return;
			}
			const url = URL.createObjectURL(new Blob([JSON.stringify(this.snapshot, null, 2)], { type: "application/json" }));
			const link = document.createElement("a");
			link.href = url;
			link.download = "performance-panel-results.json";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1e3);
		}
		destroy() {
			this.stopped = true;
			this.stopRelations?.();
			clearTimeout(this.timer);
			this.api.dispose();
		}
	};
	//#endregion
	//#region userscript/src/ui/panel.css?inline
	var panel_default = `:root, :host {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --green: #0f9d58;
  --green-ink: #188038;
  --green-soft: #e6f4ea;
  --ink: #202124;
  --muted: #626963;
  --line: #e4e8e5;
  font-family:
    Onest,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  color: #30323b;
  background: #f1f2f5;
  font-synthesis: none;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
a,
input {
  font: inherit;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
button {
  color: inherit;
}
button,
select,
a {
  -webkit-tap-highlight-color: transparent;
}
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}
svg {
  flex-shrink: 0;
  stroke-width: 1.65;
}
.scope-panel {
  --control-height: 34px;
  width: 360px;
  max-height: calc(100vh - 210px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  background: rgb(255 255 255 / 94%);
  color: var(--ink);
  border: 0;
  border-radius: 12px;
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  backdrop-filter: blur(14px) saturate(1.25);
  box-shadow: 0 18px 48px rgb(32 36 42 / 13%);
}
.scope-panel > :not(.panel-tabs) {
  flex-shrink: 0;
}
.panel-tabs {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.sheet-combobox {
  position: relative;
  flex: 1;
  min-width: 0;
}
.sheet-combobox-input {
  width: 100%;
  min-width: 0;
  height: var(--control-height);
  padding: 0 33px 0 10px;
  background: rgb(255 255 255 / 72%);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 450;
  text-overflow: ellipsis;
}
.sheet-combobox-trigger {
  position: absolute;
  right: 1px;
  top: 1px;
  height: calc(var(--control-height) - 2px);
  width: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
}
.sheet-combobox-trigger:hover {
  color: var(--ink);
  background: #f5f7f6;
}
.sheet-combobox-menu {
  width: var(--bits-combobox-anchor-width);
  min-width: var(--bits-combobox-anchor-width);
}
.sheet-combobox-viewport {
  max-height: min(260px, var(--bits-combobox-content-available-height, 260px));
  overflow-y: auto;
  scrollbar-width: thin;
}
.combobox-empty {
  padding: 12px 9px;
  color: var(--muted);
  font-size: 11px;
}
.ui-select-menu {
  z-index: 1000;
  min-width: var(--bits-select-anchor-width);
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 8px 24px #182b2019;
  font-size: 12px;
  outline: none;
  font-family: Onest, sans-serif;
}
.ui-select-item {
  padding: 8px 9px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  outline: none;
  cursor: default;
}
.ui-select-item[data-highlighted] {
  background: var(--green-soft);
  color: var(--green-ink);
}
.icon-button {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 5px;
  color: var(--muted);
}
.icon-button:hover {
  background: #f3f5f4;
  color: var(--ink);
}
.help-trigger {
  width: var(--control-height);
  height: var(--control-height);
  background: rgb(255 255 255 / 72%);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.ui-help {
  z-index: 1001;
  width: min(290px, calc(100vw - 24px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 16px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 8px 32px #182b2022;
  color: var(--muted);
  font:
    12px/1.65 Onest,
    sans-serif;
  outline: none;
}
.ui-help strong {
  font-weight: 550;
  color: var(--ink);
}
.help-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.help-close { width: 22px; height: 22px; margin: -5px -5px -5px 0; }
.ui-help p {
  margin: 8px 0;
}
.ui-help .tool-origin {
  color: var(--ink);
}
.ui-help .demo-disclosure {
  font-size: 10px;
  color: var(--muted);
}
.help-divider {
  height: 1px;
  background: var(--line);
  margin: 12px 0;
}
.glossary-tooltip {
  z-index: 1200;
  max-width: min(250px, calc(100vw - 32px));
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 10px 12px;
  background: #fff;
  color: var(--ink);
  box-shadow: 0 5px 20px #182b201a;
  font:
    11px/1.6 Onest,
    sans-serif;
}
.help-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  margin-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 10px;
}
.text-button {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 0;
  padding: 0;
  color: var(--green-ink);
  font-size: 11px;
}
.panel-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px auto;
  gap: 7px;
  margin: 10px 0 12px;
}
.primary-button,
.secondary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 33px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: #fff;
  color: var(--ink);
  white-space: nowrap;
}
.primary-button {
  background: var(--green-ink);
  border-color: var(--green-ink);
  color: #fff;
}
.primary-button:hover:not(:disabled) {
  background: #116c36;
  border-color: #116c36;
}
.secondary-button:hover {
  background: #f5f7f6;
}
.google-panel-button { padding: 0; }
.experiment-toggle { padding: 0 9px; }
.experiment-toggle[aria-pressed="true"] { color: var(--green-ink); border-color: #9bceb0; background: var(--green-soft); }
.experiment-heading { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: var(--muted); font-size: 10px; }
.experiment-back { display: flex; align-items: center; gap: 5px; }
.experiment-tabs { border-bottom: 1px solid var(--line); gap: 9px; }
.experiment-tabs .ui-tab { font-size: 11px; }
.relations-content, .relations-panel { display: flex; flex-direction: column; min-height: 0; }
.relations-content { padding-top: 12px; }
.relations-panel > :not(.relations-scroll) { flex-shrink: 0; }
.relations-heading { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.relations-heading strong { font-size: 12px; overflow-wrap: anywhere; }
.relation-live { color: var(--green-ink); font-size: 9px; white-space: nowrap; }
.relations-scroll { overflow-y: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: #0f9d5840 transparent; overscroll-behavior-y: contain; }
.relations-scroll::-webkit-scrollbar { width: 3px; }
.relations-scroll::-webkit-scrollbar-thumb { background: #0f9d5840; border-radius: 3px; }
.relation-group { border-top: 1px solid var(--line); padding: 10px 0; }
.relation-list { list-style: none; padding: 0; margin: 6px 0 0; }
.relation-list li { display: flex; flex-direction: column; gap: 3px; padding: 7px 9px; margin-bottom: 5px; border: 1px solid var(--line); border-radius: 6px; }
.relation-list code { color: var(--green-ink); font-size: 11px; overflow-wrap: anywhere; }
.relation-list span { font-size: 10px; color: var(--muted); }
.experiment-content { min-height: 0; overflow-y: auto; padding: 12px 2px 4px; scrollbar-width: thin; scrollbar-color: #0f9d5840 transparent; overscroll-behavior-y: contain; }
.experiment-content:focus-visible { outline: none; }
.experiment-context { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: var(--muted); font-size: 11px; margin-bottom: 9px; }
.experiment-group { border: 1px solid var(--line); border-radius: 7px; margin-top: 8px; }
.experiment-group > summary { display: flex; align-items: center; justify-content: space-between; padding: 11px 10px; font-size: 11px; font-weight: 500; cursor: pointer; list-style: none; }
.experiment-group > summary::-webkit-details-marker { display: none; }
.experiment-group[open] > summary > svg { transform: rotate(180deg); }
.experiment-group > summary:focus-visible { outline: 2px solid var(--green); outline-offset: -2px; border-radius: 6px; }
.metric-list { margin: 0; padding: 0 10px 5px; }
.metric-list > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid #f0f3f1; font-size: 10px; }
.metric-list dt { display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--muted); }
.metric-list dd { margin: 0; text-align: right; max-width: 45%; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.metric-help-trigger { display: inline-grid; place-items: center; flex-shrink: 0; color: #89978d; border: 0; background: none; padding: 2px; border-radius: 3px; }
.metric-help-trigger:hover { color: var(--green-ink); }
.experiment-note { margin: 8px 0; color: var(--muted); font-size: 10px; line-height: 1.6; }
.experiment-group > .experiment-note { padding: 0 10px; }
.experiment-tool-body { padding: 0 10px 10px; }
.experiment-tool-body .metric-list { padding-inline: 0; }
.experiment-value { margin: 8px 0; font-size: 14px; font-weight: 550; }
.function-list { list-style: none; margin: 0; padding: 0; }
.function-list li { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 11px; }
.function-list li > div { min-width: 0; }
.function-list code { overflow-wrap: anywhere; font-size: 10px; }
.function-list span { display: block; margin-top: 4px; color: var(--muted); font-size: 9px; }
.function-list b { font-weight: 500; font-variant-numeric: tabular-nums; }
.raw-metric { display: grid; gap: 4px; border-top: 1px solid var(--line); padding: 8px 0; font-size: 10px; overflow-wrap: anywhere; }
.raw-metric span { color: var(--muted); }
.result-period {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 12px;
}
.period-select {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--muted);
  font-size: 11px;
}
.period-select:hover {
  color: var(--ink);
}
.result-period time {
  font-size: 10px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.tabs-line {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  border: 0;
  margin: 0 -16px;
  padding: 0 12px;
}
.ui-tabs {
  position: relative;
  display: flex;
  gap: 15px;
  flex: none;
}
.ui-tab {
  position: relative;
  z-index: 1;
  padding: 9px 4px 11px;
  border: 0;
  background: none;
  font-size: 12px;
  color: var(--muted);
  font-weight: 450;
}
.ui-tab[data-state="active"] {
  color: var(--green-ink);
}
.selection-indicator {
  position: absolute;
  left: 0;
  width: 100%;
  opacity: 0;
  pointer-events: none;
}
.selection-indicator.underline {
  bottom: -1px;
  height: 2px;
  background: var(--green);
}
.selection-indicator.pill {
  top: 3px;
  bottom: 3px;
  background: #fff;
}
.type-select {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  width: auto;
  max-width: 117px;
  height: 27px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 6px;
  background: rgb(255 255 255 / 72%);
  color: var(--ink);
  font-size: 10px;
  text-align: left;
}
.type-select > span:not(.type-dot) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.type-select > svg {
  color: var(--muted);
}
.type-select:hover,
.type-select[data-state="open"] {
  background: #f3f5f4;
}
.type-menu {
  min-width: 235px;
  max-width: calc(100vw - 32px);
}
.type-option-label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.type-dot,
.cell-type-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.panel-content {
  min-height: 0;
  padding-top: 16px;
  outline: none;
}
.cells-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  overflow: hidden;
}
.panel-content[hidden] {
  display: none;
}
.cells-content > :not(.cell-list-viewport) {
  flex-shrink: 0;
}
.result-content {
  overflow-y: auto;
}
.cell-list-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  margin-top: 12px;
  overscroll-behavior-y: contain;
  scroll-padding-block: 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.cell-list-viewport::-webkit-scrollbar {
  display: none;
}
.result-content {
  scrollbar-width: thin;
  scrollbar-color: #0f9d5840 transparent;
}
.result-content::-webkit-scrollbar {
  width: 4px;
}
.result-content::-webkit-scrollbar-thumb {
  background: #0f9d5840;
  border-radius: 999px;
}
.cell-list-viewport:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}
.chart-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--muted);
}
.chart-heading b {
  font-size: 13px;
  color: var(--ink);
  font-weight: 550;
  font-variant-numeric: tabular-nums;
}
.phase-chart {
  margin: 0;
  padding: 0;
}
.phase-stack {
  position: relative;
  display: flex;
  height: 28px;
  width: 100%;
  overflow: hidden;
  border-radius: 7px;
  background: #f1f3f2;
}
.phase-segment {
  flex-basis: 0;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: inset -2px 0 #fff;
  cursor: default;
}
.phase-segment:last-child {
  box-shadow: none;
}
.phase-segment.dimmed,
.phase-key.dimmed {
  opacity: 0.3;
}
.phase-readout {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 1px 6px;
  min-width: 44px;
  border-radius: 4px;
  background: #ffffffed;
  color: var(--ink);
  box-shadow: 0 1px 4px #142a2026;
  font-size: 10px;
  line-height: 17px;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}
.phase-legend {
  display: grid;
  gap: 3px;
  padding: 0;
  margin: 17px 0 0;
  list-style: none;
}
.phase-key {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: none;
  border-radius: 3px;
  text-align: left;
  color: var(--muted);
  font-size: 11px;
  cursor: default;
}
.phase-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.phase-legend b {
  margin-left: auto;
  font-weight: 500;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.chart-insight {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}
.insight-value {
  color: var(--ink);
  font-weight: 600;
}
.cell-capacity {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.cell-capacity h3 {
  margin: 0 0 9px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
}
.capacity-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eaed;
}
.capacity-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--green-ink);
}
.capacity-caption {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.capacity-caption span {
  color: var(--ink);
}
.phase-chart.small .phase-stack {
  height: 22px;
  border-radius: 5px;
}
.phase-chart.small .phase-legend {
  margin-top: 13px;
  gap: 1px;
}
.phase-chart.small .chart-insight {
  margin-top: 13px;
  padding-top: 10px;
}
.cell-scope {
  position: relative;
  isolation: isolate;
  display: flex;
  gap: 3px;
  width: 100%;
  padding: 3px;
  background: rgb(255 255 255 / 72%);
  border-radius: 6px;
}
.cell-scope button {
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
  padding: 5px 7px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cell-scope button:first-of-type {
  flex-grow: 1.6;
}
.cell-scope button[aria-pressed="true"] {
  color: var(--green-ink);
  font-weight: 500;
}
.scope-caption,
.empty-cells {
  color: var(--muted);
  font-size: 11px;
}
.cell-list {
  display: grid;
  gap: 8px;
  list-style: none;
  padding: 4px;
  margin: 0;
}
.cell-list > li {
  min-width: 0;
  border: 1px solid rgb(219 223 227 / 72%);
  padding: 11px 10px;
  background: rgb(255 255 255 / 78%);
  border-radius: 7px;
}
.cell-list > li:hover {
  border-color: #b7cfc0;
}
.cell-list > li.empty-cells {
  border-bottom: 0;
  border: 0;
  padding: 4px 0;
}
.cell-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.cell-address {
  display: block;
  min-width: 0;
  color: var(--green-ink);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 450;
}
a.cell-address {
  border-bottom: 1px solid transparent;
  padding-bottom: 1px;
}
a.cell-address:hover,
a.cell-address:focus-visible {
  border-bottom-color: currentColor;
}
.cell-time {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cell-rule {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.formula-preview {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 3px;
  padding: 0;
  margin: 7px 0 0;
  background: none;
  color: var(--muted);
  text-align: left;
}
.formula-clip {
  display: block;
  height: 100%;
  overflow: hidden;
}
.formula-clip.faded {
  mask-image: linear-gradient(to bottom, #000 40%, #0000);
}
.formula-preview code {
  display: block;
  padding-right: 15px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    10px/16px ui-monospace,
    Consolas,
    monospace;
}
.formula-expand-icon {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  place-items: center;
  width: 15px;
  height: 16px;
  border-radius: 3px;
  background: #fff;
  opacity: 0;
  pointer-events: none;
}
.formula-preview:hover .formula-expand-icon,
.formula-preview:focus-visible .formula-expand-icon,
.formula-preview.expanded .formula-expand-icon {
  opacity: 1;
}
.formula-preview.expanded .formula-expand-icon svg {
  transform: rotate(180deg);
}
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 11px;
  border: 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}
.panel-footer a {
  color: var(--green-ink);
  text-decoration: none;
}
.panel-footer a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (prefers-reduced-motion: no-preference) {
  .selection-indicator {
    transition: clip-path 150ms var(--ease-in-out);
  }
  button.formula-preview {
    transition: height 180ms var(--ease-out);
  }
  .formula-expand-icon {
    transition: opacity 120ms var(--ease-out);
  }
  .phase-key,
  .phase-segment {
    transition: opacity 120ms var(--ease-out);
  }
  .ui-select-menu,
  .ui-help,
  .glossary-tooltip {
    animation: popup 140ms var(--ease-out);
    transform-origin: var(--bits-popover-content-transform-origin, top center);
  }
  @keyframes popup {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
`;
	//#endregion
	//#region userscript/src/host.css?inline
	var host_default = `:host {
  all: initial;
  display: inline-flex;
  align-items: center;
  margin-right: 10px;
  font: 13px Onest, Arial, sans-serif;
  text-align: left;
  direction: ltr;
  white-space: normal;
  color: var(--ink);
  --ease-out: cubic-bezier(.23,1,.32,1);
  --ease-in-out: cubic-bezier(.77,0,.175,1);
  --green: #0f9d58;
  --green-ink: #188038;
  --green-soft: #e6f4ea;
  --ink: #202124;
  --muted: #626963;
  --line: #e4e8e5;
}
:host([data-floating]) { position: fixed; right: 20px; bottom: 20px; z-index: 1000; }
.scope-trigger { width: 36px; height: 36px; border-radius: 50%; border: 0; background: #fff; color: var(--green-ink); display: grid; place-items: center; padding: 0; }
.scope-trigger[aria-expanded="true"] { background: var(--green-soft); }
.scope-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.scope-surface { border: 0; padding: 0; margin: 0; overflow: visible; background: transparent; width: min(360px, calc(100vw - 16px)); color: var(--ink); }
.scope-surface::backdrop { background: transparent; }
.scope-panel { width: 100%; max-height: min(var(--surface-height, calc(100vh - 80px)), calc(100vh - 16px)); text-align: left; }
.scope-portals { position: relative; z-index: 2; }
.ui-help { max-height: calc(100vh - 32px); overflow-y: auto; }
.connection-notice { margin: 12px 0 0; font-size: 11px; line-height: 1.6; color: var(--muted); }
.connection-notice .text-button { display: block; margin-top: 4px; }
`;
	//#endregion
	//#region userscript/src/ui/launcher.css?inline
	var launcher_default = `.scope-indicator {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--green-ink);
}
.scope-indicator-idle,
.scope-indicator-matrix {
  grid-area: 1 / 1;
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
}
.scope-indicator-idle { display: grid; place-items: center; }
.scope-indicator-idle svg { display: block; width: 1.125rem; height: 1.125rem; }
.scope-indicator-matrix {
  display: grid;
  grid-template-columns: repeat(7, 2.4px);
  grid-template-rows: repeat(7, 2.4px);
  gap: .6px;
  width: 20.4px;
  height: 20.4px;
  opacity: 0;
  transform: scale(.84);
}
.scope-indicator[data-running="true"] .scope-indicator-idle { opacity: 0; transform: scale(.84); }
.scope-indicator[data-running="true"] .scope-indicator-matrix { opacity: 1; transform: scale(1); }
.scope-indicator-dot { position: relative; display: block; width: 2.4px; height: 2.4px; }
.scope-indicator-dot::before,
.scope-indicator-dot b { position: absolute; inset: 0; border-radius: 50%; background: currentColor; }
.scope-indicator-dot::before { content: ''; opacity: var(--rest, .25); }
.scope-indicator-dot b { display: block; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .scope-indicator-idle,
  .scope-indicator-matrix { transition: none; transform: none !important; }
  .scope-indicator[data-running="true"] .scope-indicator-dot::before { opacity: .5; }
}
`;
	//#endregion
	//#region userscript/src/menu.js
	var element = (tag, className) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	};
	function mountMenu(api) {
		if (document.getElementById("sheets-scope-userscript")) return;
		const host = element("span");
		host.id = "sheets-scope-userscript";
		const root = host.attachShadow({ mode: "open" });
		const style = element("style");
		style.textContent = panel_default + host_default + launcher_default;
		root.append(style);
		const trigger = element("button", "scope-trigger");
		trigger.type = "button";
		trigger.title = "Производительность таблицы";
		trigger.setAttribute("aria-label", trigger.title);
		trigger.setAttribute("aria-expanded", "false");
		const surface = element("div", "scope-surface");
		surface.id = "scope-menu";
		surface.popover = "manual";
		const target = element("div"), portal = element("div", "scope-portals");
		surface.append(target, portal);
		trigger.popoverTargetElement = surface;
		trigger.setAttribute("aria-controls", surface.id);
		root.append(trigger, surface);
		const model = new LiveModel(api, () => surface.hidePopover());
		const launcherIcon = mount(LauncherIcon, {
			target: trigger,
			props: { model }
		});
		const instance = mount(Surface, {
			target,
			props: {
				model,
				portal
			}
		});
		const position = () => {
			if (!surface.matches(":popover-open")) return;
			const rect = trigger.getBoundingClientRect(), width = Math.min(360, innerWidth - 16);
			const top = Math.min(rect.bottom + 8, Math.max(8, innerHeight - surface.offsetHeight - 8));
			surface.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.right - width))}px`;
			surface.style.top = `${Math.max(8, top)}px`;
			surface.style.setProperty("--surface-height", `${innerHeight - Math.max(8, top) - 8}px`);
		};
		surface.addEventListener("toggle", (event) => {
			if (event.target !== surface) return;
			const open = event.newState === "open";
			trigger.setAttribute("aria-expanded", String(open));
			model.setOpen(open);
			position();
		});
		for (const name of ["keydown", "keyup"]) root.addEventListener(name, (event) => event.stopPropagation());
		root.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !event.defaultPrevented) surface.hidePopover();
		});
		const outside = (event) => {
			if (!surface.matches(":popover-open") || event.composedPath().includes(host)) return;
			if (event.type === "keydown" ? event.key === "Escape" && !event.defaultPrevented : !model.relationsWatching) surface.hidePopover();
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", outside);
		trigger.addEventListener("click", (event) => event.stopPropagation());
		const resize = new ResizeObserver(position);
		resize.observe(surface);
		window.addEventListener("resize", position, { passive: true });
		const follow = () => {
			if (model.panelOpen) model.poll(true);
		};
		window.addEventListener("hashchange", follow);
		const observer = new MutationObserver(place);
		let header;
		function place() {
			const anchor = document.getElementById("docs-titlebar-share-client-button");
			if (anchor) {
				if (host.nextSibling !== anchor) anchor.before(host);
				host.removeAttribute("data-floating");
			} else {
				if (host.parentNode !== document.body) document.body.append(host);
				host.setAttribute("data-floating", "");
			}
			const next = document.getElementById("docs-header-container");
			if (header !== next) {
				observer.disconnect();
				header = next;
				observer.observe(document.body, { childList: true });
				if (header) {
					observer.observe(header, {
						childList: true,
						subtree: true
					});
					for (let parent = header.parentElement; parent && parent !== document.body; parent = parent.parentElement) observer.observe(parent, { childList: true });
				}
			}
		}
		place();
		const onPageHide = (event) => {
			if (event.persisted) return;
			window.removeEventListener("pagehide", onPageHide);
			observer.disconnect();
			resize.disconnect();
			model.destroy();
			unmount(instance);
			unmount(launcherIcon);
			window.removeEventListener("resize", position);
			window.removeEventListener("hashchange", follow);
			host.remove();
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", outside);
		};
		window.addEventListener("pagehide", onPageHide);
	}
	//#endregion
	//#region userscript/src/debug-controls.js
	var debugSelector = "[id=\"docs-debug-menu\"], [id^=\"docs-debug-\"], [id^=\"docs-js-error\"], [id=\"timeline-toolbar-debug\"]";
	function createDebugControls(document, getStyle) {
		const changed = /* @__PURE__ */ new Map();
		let enabled = false;
		const readStyle = (el, key) => [el.style.getPropertyValue(key), el.style.getPropertyPriority(key)];
		function status() {
			return {
				enabled,
				controls: [...changed.keys()].filter((el) => el.isConnected).map((el) => ({
					id: el.id,
					label: el.getAttribute("aria-label") || el.textContent?.trim() || el.id,
					visible: el.getClientRects().length > 0 && getStyle(el).visibility !== "hidden"
				}))
			};
		}
		function show() {
			enabled = true;
			for (const el of document.querySelectorAll(debugSelector)) {
				if (changed.has(el)) continue;
				const role = el.getAttribute("role");
				if (el.tagName !== "BUTTON" && ![
					"button",
					"menuitem",
					"menuitemcheckbox",
					"menuitemradio",
					"switch"
				].includes(role)) continue;
				const computed = getStyle(el), style = {
					display: computed.display,
					visibility: computed.visibility
				};
				if (!el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true" && style.display !== "none" && style.visibility !== "hidden") continue;
				const saved = {
					attrs: /* @__PURE__ */ new Map(),
					styles: /* @__PURE__ */ new Map()
				};
				if (el.hasAttribute("hidden")) {
					saved.attrs.set("hidden", [el.getAttribute("hidden"), null]);
					el.removeAttribute("hidden");
				}
				if (el.getAttribute("aria-hidden") === "true") {
					saved.attrs.set("aria-hidden", ["true", "false"]);
					el.setAttribute("aria-hidden", "false");
				}
				for (const [key, value] of [["display", "inline-flex"], ["visibility", "visible"]]) {
					if (key === "display" ? style.display !== "none" : style.visibility !== "hidden") continue;
					saved.styles.set(key, {
						before: readStyle(el, key),
						after: [value, "important"]
					});
					el.style.setProperty(key, value, "important");
				}
				changed.set(el, saved);
			}
			return status();
		}
		function restore() {
			for (const [el, saved] of changed) {
				for (const [key, [before, after]] of saved.attrs) if (el.getAttribute(key) === after) {
					if (before === null) el.removeAttribute(key);
					else el.setAttribute(key, before);
				}
				for (const [key, { before, after }] of saved.styles) if (readStyle(el, key).every((part, i) => part === after[i])) {
					if (before[0]) el.style.setProperty(key, ...before);
					else el.style.removeProperty(key);
				}
			}
			changed.clear();
			enabled = false;
			return status();
		}
		return {
			show,
			restore,
			status
		};
	}
	//#endregion
	//#region userscript/src/entry.js
	if (window === window.top && !globalThis.SheetsScopeUserscript) {
		const bookId = bookIdFromURL(location.href);
		if (bookId) {
			let setting, enabled = true, storageError = null;
			try {
				setting = preferences(localStorage, bookId);
				enabled = setting.enabled();
			} catch {
				storageError = "Настройка замеров недоступна: браузер запретил localStorage.";
			}
			const timing = installTiming(globalThis, enabled);
			const native = createAdapter(timing);
			const debug = createDebugControls(document, (el) => getComputedStyle(el));
			const api = Object.freeze({
				...native,
				revealDebugControls(value = true) {
					return value ? debug.show() : debug.restore();
				},
				debugControlsStatus() {
					return debug.status();
				},
				dispose() {
					debug.restore();
					native.dispose();
				},
				status() {
					return {
						...timing.status(),
						enabled,
						storageError,
						manager: typeof GM_info === "object" ? GM_info.scriptHandler : null
					};
				},
				setEnabled(value) {
					if (!setting) throw Error(storageError);
					setting.set(!!value);
					return {
						reloadRequired: true,
						enabled: !!value
					};
				}
			});
			globalThis.SheetsScopeUserscript = api;
			const mount = () => mountMenu(api);
			if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
			else mount();
		}
	}
	//#endregion
})();

/*! Third-party notices (apply to the named dependencies only)
@floating-ui/core 1.8.0
MIT License

Copyright (c) 2021-present Floating UI contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


@floating-ui/dom 1.8.0
MIT License

Copyright (c) 2021-present Floating UI contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


@floating-ui/utils 0.2.12
MIT License

Copyright (c) 2021-present Floating UI contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


@lucide/svelte 1.47.0
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


bits-ui 2.19.2
MIT License

Copyright (c) 2023 Hunter Johnston

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


clsx 2.1.1
MIT License

Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


inline-style-parser 0.2.7
(The MIT License)

Copyright (c) 2012 TJ Holowaychuk <tj@vision-media.ca>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


runed 0.35.1
MIT License

Copyright (c) 2024 Hunter Johnston <https://github.com/huntabyte>
Copyright (c) 2024 Thomas G. Lopes <https://github.com/tglide>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


style-to-object 1.0.14
The MIT License (MIT)

Copyright (c) 2017 Menglin "Mark" Xu <mark@remarkablemark.org>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


svelte 5.57.1
Copyright (c) 2016-2025 [Svelte Contributors](https://github.com/sveltejs/svelte/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


svelte-toolbelt 0.10.6
MIT License

Copyright (c) 2024 Hunter Johnston <https://github.com/huntabyte>
Copyright (c) 2024 Thomas G. Lopes <https://github.com/tglide>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


tabbable 6.5.0
The MIT License (MIT)

Copyright (c) 2015 David Clark

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.



Onest
Copyright 2021 The Onest Project Authors (https://github.com/googlefonts/onest)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

*/
