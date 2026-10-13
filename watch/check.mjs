#!/usr/bin/env node
// Bundled by `bun run watch:build` from SheetsScope tools/watch/check.mjs; do not edit.

// tools/watch/check.mjs
import { mkdirSync, mkdtempSync, readFileSync as readFileSync3, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join3 } from "node:path";

// tools/native-build/google-page.mjs
import { createHash } from "node:crypto";

// userscript/src/ui/locales/en.js
var en = {
  "Эффективность таблицы": "Spreadsheet performance",
  "Результаты": "Results",
  "Результат": "Result",
  "Эффективность": "Performance",
  "Запустите расчёт, чтобы увидеть время.": "Run a calculation to see the timing.",
  "Результаты вычислений": "Calculation results",
  "Адрес недоступен": "Address unavailable",
  "Правило проверки недоступно": "Validation rule unavailable",
  "Правило форматирования недоступно": "Formatting rule unavailable",
  "Формула не загружена": "Formula not loaded",
  "Для этого листа и типа в доступных замерах нет результатов.": "No measurements for this sheet and type yet.",
  "Область результатов": "Result scope",
  "Включая ячейки других листов из этого расчёта": "Including cells on other sheets from this calculation",
  "Со связями": "With linked sheets",
  "Вся таблица": "Whole spreadsheet",
  "Лист для расчёта": "Sheet to calculate",
  "Найти лист…": "Find a sheet…",
  "Показать листы": "Show sheets",
  "Листы не найдены": "No sheets found",
  "Лист недоступен": "Sheet unavailable",
  "Последнее изменение": "Latest change",
  "С момента открытия": "Since opening",
  "Период замеров": "Measurement period",
  "Последнее обновление результатов": "Results last updated",
  "Все типы вычислений": "All calculation types",
  "Все типы": "All types",
  "Тип вычислений": "Calculation type",
  "{count} из {limit} ячеек": "{count} of {limit} cells",
  "Данные недоступны": "Data unavailable",
  "Число ячеек": "Cell count",
  "из": "of",
  "Распределение времени по этапам": "Time by stage",
  "Общий расчёт": "Total calculation",
  "Известное время": "Known time",
  "времени — {phase}": "of the time is {phase}",
  "Свернуть формулу {address}": "Collapse formula {address}",
  "Раскрыть формулу {address}": "Expand formula {address}",
  "О показателе «{label}»": "About “{label}”",
  "Идёт расчёт": "Calculating",
  "Производительность таблицы": "Spreadsheet performance",
  "{value} с": "{value} s",
  "{value} мс": "{value} ms",
  "Формулы": "Formulas",
  "Формат": "Formatting",
  "Условное форматирование": "Conditional formatting",
  "Проверка": "Validation",
  "Проверка данных": "Data validation",
  "Таблицы": "Tables",
  "Объекты": "Objects",
  "Служебные ячейки": "Service cells",
  "Загрузка": "Loading",
  "Неизвестный тип": "Unknown type",
  "Тип {type}": "Type {type}",
  "неизвестен": "unknown",
  "О замерах": "About the measurements",
  "Об инструменте": "About this tool",
  "Закрыть справку": "Close help",
  "Расчёт и замеры выполняет Google. Иконка панели открывает штатный инструмент.": "Google does the calculating and measuring. The panel icon opens Google’s own tool.",
  "Макет с демо-данными.": "Demo with sample data.",
  "«Пересчитать» — запускает расчёт выбранного листа; связанные листы тоже могут затронуться.": "“Recalculate” runs the selected sheet; linked sheets may recalculate too.",
  "«Со связями» — показывает полученные замеры ячеек других листов.": "“With linked sheets” also shows cells from other sheets.",
  "Время ячейки — её самый долгий замер за период; повторы не складываются.": "A cell’s time is its longest measurement in the period; repeats are not added up.",
  "«С момента открытия» — замеры текущей сессии.": "“Since opening” covers the current session.",
  "В списке могут быть не все ячейки. Время загрузки, расход памяти и время частей формулы недоступны.": "The list may not include every cell. Load time, memory use and time per formula part are not available.",
  "Замеры до подключения скрипта не сохраняются.": "Nothing is measured before the script starts.",
  "Скачать результаты": "Download results",
  "Скачать данные": "Download data",
  "Выключить замеры в этой таблице": "Turn off measurements here",
  "Расчёт…": "Calculating…",
  "Пересчитать": "Recalculate",
  "Панель Google": "Google panel",
  "Открыть панель Google": "Open Google’s panel",
  "Экспериментальные метрики": "Experimental metrics",
  "Эксперимент": "Experiment",
  "Для адресных замеров нужен ранний запуск.": "Per-cell timing needs the script to start early.",
  "Подключить и перезагрузить": "Connect and reload",
  "Ссылки в формуле": "Formula references",
  "Диапазоны из нативной модели формулы. Повторы объединены. Это ссылки, а не измерение фактических чтений или времени.": "Ranges from Google’s formula model, duplicates merged. These are references, not measured reads or time.",
  "Связи расчёта": "Calculation links",
  "Связи, переданные движком: диапазоны, структура листа, форматирование и проверка данных. Тип связи указан рядом.": "Links reported by the engine: ranges, sheet structure, formatting and data validation. The link type is shown next to each.",
  "Выход массива": "Array output",
  "Диапазон, куда выражение массива выводит результат. Это не входные данные формулы.": "Where an array expression writes its result. Not an input of the formula.",
  "Кто может использовать": "Possibly used by",
  "Кандидаты из обратного индекса формул загруженного листа. Диапазон может содержать несколько формул; связь каждой клетки отдельно не проверена. Это не полная карта книги.": "Candidates from the reverse formula index of the loaded sheet. A range may hold several formulas and each cell is not checked separately. Not a full map of the spreadsheet.",
  "Выражение массива": "Array expression",
  "Структура листа": "Sheet structure",
  "Форматирование · структура": "Formatting · structure",
  "Проверка данных · структура": "Data validation · structure",
  "Диапазон формулы": "Formula range",
  "Выбранная ячейка": "Selected cell",
  "Демо": "Demo",
  "Автообновление": "Live",
  "Нажмите другую ячейку — связи обновятся здесь. Окно останется открытым.": "Click another cell and its links show up here. The panel stays open.",
  "Читаем связи…": "Reading links…",
  "Выберите одну ячейку.": "Select a single cell.",
  "Google не предоставил данные.": "Google did not provide this data.",
  "В доступных данных нет записей.": "Nothing here in the available data.",
  "Показана часть индекса: достигнут лимит чтения или есть неизвестные записи.": "Only part of the index is shown: the read limit was reached or some entries are unknown.",
  "Часть ссылок недоступна или превышает лимит чтения.": "Some references are unavailable or over the read limit.",
  "Только загруженные данные. Отсутствие записи не доказывает отсутствие связи.": "Loaded data only. A missing entry does not prove there is no link.",
  "Открытый диапазон": "Open-ended range",
  "Все фазы расчёта": "All calculation stages",
  "Движок Google обновился и ещё не сверён с проверенным. Счётчики показаны по прежней схеме полей: их смысл мог измениться.": "Google updated its engine and this version has not been checked yet. Counters use the previous field layout, so their meaning may have changed.",
  "Основной": "Main",
  "Демо-данные": "Sample data",
  "По выбранной ячейке": "For the selected cell",
  "Последний снимок": "Latest snapshot",
  "Экспериментальные функции": "Experimental features",
  "Счётчики": "Counters",
  "Функции": "Functions",
  "Связи": "Links",
  "Инструменты": "Tools",
  "Фаза экспериментальных метрик": "Stage for experimental metrics",
  "Область метрик": "Metric scope",
  "Агрегаты последнего native-снимка, включая зависимые листы. Не показатели выбранной ячейки. Пакеты могут повторять накопленные числа, поэтому здесь нет суммы за сессию. Неполная сумма помечена звёздочкой.": "Totals from Google’s latest snapshot, dependent sheets included. Not figures for the selected cell. Snapshots can repeat running totals, so there is no session sum. Partial sums are marked with an asterisk.",
  "Пока нет снимка поддерживаемого движка. Запустите расчёт.": "No snapshot from a supported engine yet. Run a calculation.",
  "— означает, что Google не передал безопасное числовое значение. * — сумма только фаз, в которых показатель доступен.": "— means Google sent no safe number. * is a sum over only the stages that have this value.",
  "Данные есть не во всех выбранных фазах": "Not every selected stage has data",
  "— нет данных · * неполная сумма": "— no data · * partial sum",
  "Срабатывания функций": "Function hits",
  "Частоты функций": "Function frequency",
  "Количество срабатываний в инструментированных путях движка. Есть служебные имена. Это не полный счётчик операций и не время функции; адресной привязки нет. Сбор зависит от отдельной настройки Google, не только от таймеров.": "How often instrumented engine paths ran; some names are internal. Not a full operation count or a function’s time, and not tied to cells. Collection depends on a separate Google setting, not only the timers.",
  "В снимке нет записей частот.": "The snapshot has no frequency entries.",
  "Google не передал частоты функций.": "Google sent no function frequencies.",
  "Настройки движка автоматически не меняются.": "Engine settings are never changed automatically.",
  "Часть записей имеет неизвестный формат.": "Some entries have an unknown format.",
  "Этапы и загрузка": "Stages and loading",
  "Сигнал Worker": "Worker signal",
  "Прогресс": "Progress",
  "Последний полученный сигнал расчёта. Процент относится к очереди Google, а не только к выбранному листу. Он не доказывает завершение отрисовки или сохранения.": "The latest calculation signal. The percentage is for Google’s whole queue, not just the selected sheet, and does not mean rendering or saving has finished.",
  "Оценка объёма": "Work estimate",
  "numDirtyCellsEstimate из сигнала прогресса. Это оценка предстоящей работы, не точное число операций.": "numDirtyCellsEstimate from the progress signal: an estimate of work ahead, not an exact operation count.",
  "Получение Wasm": "Wasm download",
  "Разность нативных отметок начала и завершения получения Wasm. Производная длительность старта, не время формул.": "Time between Google’s own start and end marks for downloading Wasm. Startup time, not formula time.",
  "Создание Wasm": "Wasm setup",
  "Нативная длительность instantiateStreaming при запуске движка. Если подключились поздно, данных может не быть.": "Google’s own instantiateStreaming time at engine start. Missing if the script connected late.",
  "Инициализация": "Initialization",
  "Нативная длительность начальной инициализации Worker. Не полное время загрузки таблицы.": "Google’s own Worker initialization time. Not the full spreadsheet load time.",
  "Ошибки создания": "Setup failures",
  "Число неудачных попыток инстанцирования Wasm при старте. Отсутствие поля не равно нулю.": "Failed Wasm setup attempts at startup. A missing value is not zero.",
  "Нативное время фазы последнего снимка. Ожидание очереди и применение результатов сюда автоматически не добавляются.": "Google’s own stage time from the latest snapshot. Queue wait and applying results are not included.",
  "Ожидание и применение результата: отдельные замеры пока недоступны.": "Waiting and applying results: no separate measurements yet.",
  "Что это": "What this is",
  "Исходные значения · единицы не установлены": "Raw values · units unknown",
  "Показаны первые 1000 ключей журнала.": "Showing the first 1000 log keys.",
  "Журнал недоступен": "Log unavailable",
  "Из кэша панели Google · время получения неизвестно": "From Google’s panel cache · time received unknown",
  "Показать существующие скрытые кнопки. Это меняет только видимость; команды могут быть не подключены.": "Show existing hidden buttons. This changes visibility only; the commands may not be wired up.",
  "Доступно в Google Таблицах после обновления скрипта.": "Available in Google Sheets after updating the script.",
  "Найти ещё": "Find more",
  "Показать скрытые кнопки": "Show hidden buttons",
  "Вернуть исходный вид": "Restore original view",
  "показано": "shown",
  "скрыто родительским элементом": "hidden by a parent element",
  "Существующих скрытых отладочных кнопок не найдено.": "No hidden debug buttons found.",
  "единицы неизвестны": "units unknown",
  "Поле {n}": "Field {n}",
  "Пустой список": "Empty list",
  "Google не передал CacheSizes.": "Google sent no CacheSizes.",
  "{bytes} Б": "{bytes} B",
  "Найдено {count}": "Found {count}",
  "Объём расчёта": "Calculation volume",
  "Чтение и изменения": "Reads and changes",
  "Кэш частей формул": "Formula part cache",
  "Массивы и источники": "Arrays and sources",
  "Исходная область": "Initial scope",
  "Число объектов, помеченных для пересчёта в начале фазы. Это не число операций внутри формулы.": "Objects marked for recalculation when the stage starts. Not the number of operations inside a formula.",
  "К пересчёту": "To recalculate",
  "Объём работы, отмеченной движком в этой фазе. Не обязательно уникальные ячейки.": "Work the engine marked in this stage. Not necessarily unique cells.",
  "Вычислено": "Evaluated",
  "Число вычислений объектов фазы, включая возможные повторы. Не инструкции CPU.": "Evaluations in this stage, repeats included. Not CPU instructions.",
  "Прямые зависимости": "Direct dependents",
  "Число напрямую зависимых объектов, затронутых пересчётом. Не список связей между адресами.": "Directly dependent objects touched by the recalculation. Not a list of links between cells.",
  "Косвенные зависимости": "Indirect dependents",
  "Число косвенно зависимых объектов, затронутых пересчётом.": "Indirectly dependent objects touched by the recalculation.",
  "Проходы": "Rounds",
  "Количество раундов расчёта, зарегистрированных движком.": "Calculation rounds recorded by the engine.",
  "Итеративные проходы": "Iterative rounds",
  "Количество раундов итеративного расчёта. Отсутствие поля не означает ноль.": "Iterative calculation rounds. A missing value does not mean zero.",
  "Чтения ячеек": "Cell reads",
  "Количество обращений к ячейкам. Повторные чтения учитываются; это не число уникальных адресов.": "Cell accesses, repeats included. Not the number of unique cells.",
  "Чтения из модели": "Model reads",
  "Обращения к модели данных, отдельно учтённые движком. Не число сетевых запросов.": "Data model accesses counted separately by the engine. Not network requests.",
  "Чтения диапазонов": "Range reads",
  "Количество обращений к диапазонам. Не количество ячеек внутри них.": "Range accesses. Not the number of cells inside them.",
  "Попытки обновления": "Update attempts",
  "Попытки записать вычисленное значение до проверки, изменилось ли оно.": "Attempts to write a computed value before checking whether it changed.",
  "Изменения значений": "Value changes",
  "Обновления, которые прошли проверку изменения значения в движке.": "Updates that passed the engine’s changed-value check.",
  "Обновления ячеек": "Cell updates",
  "Отдельный счётчик обновлений ячеек. Его нельзя складывать с попытками и изменениями значений.": "A separate cell update counter. Do not add it to attempts or value changes.",
  "Обнаружено": "Detected",
  "Случаи обнаружения кэширования подвыражений. Не количество попаданий в кэш.": "Times subexpression caching was detected. Not cache hits.",
  "Применено к ячейкам": "Applied to cells",
  "Случаи применения механизма кэширования частей формулы. Эти два числа не образуют hit rate.": "Times formula part caching was applied. These two numbers are not a hit rate.",
  "Массивные формулы": "Array formulas",
  "Количество вычисленных массивных формул.": "Array formulas evaluated.",
  "Ячейки результатов": "Result cells",
  "Количество ячеек результатов массивных формул. Это размер результатов, не время каждого элемента.": "Cells filled by array formula results. Result size, not per-item time.",
  "Сводные таблицы": "Pivot tables",
  "Количество вычислений сводных таблиц, отмеченных движком.": "Pivot table evaluations recorded by the engine.",
  "Строки сводных": "Pivot rows",
  "Суммарный показатель строк сводных таблиц в статистике фазы.": "Total pivot table rows in the stage statistics.",
  "Столбцы сводных": "Pivot columns",
  "Суммарный показатель столбцов сводных таблиц в статистике фазы.": "Total pivot table columns in the stage statistics.",
  "Источники данных": "Data sources",
  "Количество вычислений источников данных. Не длительность серверных запросов.": "Data source evaluations. Not server request time.",
  "Ссылки на таблицы": "Table references",
  "Обращения к ссылкам на таблицы, учтённые движком.": "Table reference accesses counted by the engine.",
  "Логические правила": "Boolean rules",
  "Количество вычислений логических правил условного форматирования.": "Boolean conditional formatting rule evaluations.",
  "Цветовые шкалы": "Color scales",
  "Количество вычислений градиентных правил условного форматирования.": "Color scale conditional formatting rule evaluations.",
  "Простые логические": "Simple boolean",
  "Отдельная категория simple boolean движка. Не прибавляем к общему числу правил без доказанной непересекаемости.": "The engine’s separate “simple boolean” category. Not added to the rule total, since overlap is not ruled out.",
  "Простые шкалы": "Simple scales",
  "Отдельная категория simple gradient движка. Не самостоятельный замер времени правила.": "The engine’s separate “simple gradient” category. Not a timing of the rule.",
  "Журнал задержек": "Latency log",
  "docs_latencyStats хранит последние три записи на ключ, если Google включил этот журнал. Читаем существующие записи без переключения флагов.": "docs_latencyStats keeps the last three entries per key when Google has this log on. Existing entries are read; no flags are switched.",
  "Размер модели": "Model size",
  "Показатель штатной панели, полученный с сервера. Это размер модели документа, а не оперативная память или память формулы.": "The figure from Google’s own panel, sent by the server. Document model size, not RAM or formula memory.",
  "Структура кэшей": "Cache layout",
  "CacheSizes содержит 14 внутренних полей. Их смысл пока не восстановлен: показываем номера и исходные числа, не называя их байтами или попаданиями в кэш.": "CacheSizes has 14 internal fields whose meaning is not known yet. Shown as field numbers and raw values, not as bytes or cache hits.",
  "Ручной расчёт": "Manual calculation",
  "Восстановлена команда включения и ветка Worker MANUAL_CALC. Доступ зависит от femc. Переключение в живой таблице ещё не проверено; экспериментальный раздел этот режим не включает.": "The switch command and the Worker MANUAL_CALC path were traced. Access depends on femc. Not tried in a live spreadsheet yet; this section never turns the mode on.",
  "Код подтверждён · запуск не проверен": "Code confirmed · not run",
  "Скрытое меню «Отладка» найдено в живой странице. Рабочие команды Sheets и способ их включения не подтверждены. Простое снятие скрытия этого не доказывает.": "A hidden “Debug” menu exists on the live page. Its working commands and how to enable them are not confirmed; unhiding it proves nothing.",
  "Меню скрыто · команды не проверены": "Menu hidden · commands unverified",
  "Отладка календарного Timeline": "Calendar Timeline debug",
  "Это календарная шкала карточек, не профайлер формул. В проверенной сборке Google явно отключил debug-кнопку в шаблоне; обработчик её команды не найден.": "This is the calendar card timeline, not a formula profiler. Google disabled its debug button in the checked build and no handler was found.",
  "Отключено в коде Google": "Disabled in Google’s code",
  "Служебные формулы": "Internal formulas",
  "Имена DEBUG_SLEEP и других функций встречаются в реестре. Возможность использовать их в обычной таблице не доказана.": "DEBUG_SLEEP and other names appear in the function registry. Using them in a normal spreadsheet is not proven.",
  "Доступ не подтверждён": "Access unconfirmed",
  "Операции и память ячейки": "Cell operations and memory",
  "Готовые счётчики всех операций, памяти и времени подвыражений для отдельного адреса не найдены. Агрегаты нельзя приписать карточке формулы.": "No per-cell counters for operations, memory or subexpression time were found. Totals cannot be attributed to a single formula card.",
  "Метрика не найдена": "Metric not found",
  "Google не предоставил журнал": "Google provides no log here",
  "Недоступно": "Unavailable",
  "Неподдерживаемый тип": "Unsupported type",
  "В журнале пока нет записей": "The log is empty so far",
  "Источник журнала не прошёл проверку совместимости": "The log source failed the compatibility check",
  "Нет данных штатной панели": "No data from Google’s panel",
  "Источник размера не прошёл проверку совместимости": "The size source failed the compatibility check",
  "Google ещё не предоставил размер": "Google has not reported the size yet",
  "применяет LAMBDA к элементам диапазонов": "applies a LAMBDA to range items",
  "задаёт обработку элемента": "defines how an item is processed",
  "вычисляет массив значений": "evaluates an array of values",
  "суммирует строки по нескольким условиям": "sums rows matching several conditions",
  "считает строки по нескольким условиям": "counts rows matching several conditions",
  "считает совпадения по условию": "counts matches for a condition",
  "суммирует значения по условию": "sums values matching a condition",
  "ищет совпадение и возвращает соответствующее значение": "finds a match and returns the matching value",
  "ищет в первом столбце диапазона": "looks up in the first column of a range",
  "берёт значение по позиции": "takes the value at a position",
  "находит позицию совпадения": "finds the position of a match",
  "выбирает результат по условию": "picks a result by condition",
  "заменяет ошибку другим результатом": "replaces an error with another result",
  "заменяет ошибку отсутствующего совпадения": "replaces a not-found error",
  "выбирает результат по первому выполненному условию": "picks the result of the first true condition",
  "соединяет массивы по вертикали": "stacks arrays vertically",
  "соединяет массивы по горизонтали": "stacks arrays horizontally",
  "выбирает наибольшее значение": "picks the largest value",
  "задаёт имена промежуточным значениям": "names intermediate values",
  "отбирает строки по условиям": "filters rows by conditions",
  "обрабатывает диапазон по тексту запроса": "runs a query over a range",
  "складывает значения": "adds values",
  "сортирует диапазон": "sorts a range",
  "оставляет уникальные значения": "keeps unique values",
  "читает диапазон другой книги": "reads a range from another spreadsheet",
  "получает ссылку из текста": "builds a reference from text",
  "строит ссылку со смещением": "builds an offset reference",
  "выбирает строки массива": "picks rows of an array",
  "соединяет текстовые значения": "joins text values",
  "функция в формуле; смысл определяется её аргументами": "a function in the formula; its meaning depends on its arguments",
  "Замеры в этой таблице выключены. Нажмите «Подключить и перезагрузить».": "Measurements are off for this spreadsheet. Click “Connect and reload”.",
  "Вычисления Google ещё не подключены. Дождитесь загрузки таблицы и повторите.": "Google’s calculation engine is not connected yet. Wait for the spreadsheet to load and try again.",
  "Замеры остановлены. Перезагрузите таблицу.": "Measurements stopped. Reload the spreadsheet.",
  "Нет подключения к вычислениям Google. Перезагрузите таблицу.": "Not connected to Google’s calculation engine. Reload the spreadsheet.",
  "Пересчёт запущен. Замеры пока недоступны: {reason}": "Recalculation started. No measurements yet: {reason}",
  "Нет нового результата за 120 с. Автоматического повтора нет.": "No new result within 120 s. It will not retry on its own.",
  "Расчёт не запущен.": "The calculation did not start.",
  "Ожидаем раннего подключения к вычислениям…": "Waiting to connect to the calculation engine…",
  "Результаты ещё не получены.": "No results yet.",
  "Worker недоступен в контексте страницы.": "Worker is not available on this page.",
  "Worker вычислений Google не найден: раннее подключение пропущено. Перезагрузите таблицу после обновления скрипта.": "Google’s calculation Worker was not found: the script started too late. Reload the spreadsheet after updating the script.",
  "Worker вычислений Google найден, но команда его запуска не найдена. Таймеры не включены; итоги фаз показаны, если Google их присылает.": "Google’s calculation Worker was found, but not its start command. Timers are off; stage totals are shown if Google sends them.",
  "Google изменил формат запуска Worker. Таймеры не включены, сообщение передано без изменений.": "Google changed the Worker start format. Timers are off; the message was passed on unchanged.",
  "Worker Google не ответил после включения таймеров. При следующей загрузке таблица запустится без них. Перезагрузите таблицу.": "Google’s Worker did not respond after timers were turned on. The next load will start without them. Reload the spreadsheet.",
  "Worker Google не ответил после включения таймеров. Браузер не дал сохранить отметку, поэтому после перезагрузки таймеры включатся снова; если сбой повторится, отключите скрипт. Перезагрузите таблицу.": "Google’s Worker did not respond after timers were turned on. The browser did not let the script save a note, so the timers turn on again after a reload; if the failure repeats, turn the script off. Reload the spreadsheet.",
  "Таймеры ячеек временно не включаются: при прошлой загрузке Worker Google не ответил после их включения. Итоги фаз показаны, если Google их присылает.": "Cell timers stay off for now: on an earlier load Google’s Worker did not respond after they were turned on. Stage totals are shown if Google sends them.",
  "Строгий режим: Worker Google сверён. Перезагрузите таблицу, чтобы включить таймеры ячеек.": "Strict mode: Google’s Worker is verified. Reload the spreadsheet to turn on cell timers.",
  "Строгий режим: Worker Google ещё не сверён, таймеры ячеек не включены. Если сверка пройдёт, они включатся после перезагрузки таблицы.": "Strict mode: Google’s Worker is not verified yet, so cell timers are off. If verification passes, they turn on after a reload.",
  "Google обновил вычисления. Worker сверён: код обвязки совпал с проверенным офлайн.": "Google updated its calculation engine. The Worker is verified: its wrapper code matches an offline-checked one.",
  "Google обновил вычисления. Код обвязки Worker изменился, но путь сообщений совпал с проверенным офлайн.": "Google updated its calculation engine. The Worker’s wrapper code changed, but its message path matches an offline-checked one.",
  "Google обновил вычисления. Замеры включены: формат запуска и результатов проверен в браузере, офлайн-сверка Worker ещё не проведена.": "Google updated its calculation engine. Timings are on: the start and result formats were checked in the browser; the Worker has not been verified offline yet.",
  "Данные Worker не прошли проверку ({reason}). Новые числа скрыты, прошлый результат помечен устаревшим.": "Worker data failed a check ({reason}). The new numbers are hidden and the previous result is marked stale.",
  "Таймеры ячеек не включились — видны только итоги фаз.": "Cell timers did not turn on — only stage totals are shown.",
  "Строгий режим": "Strict mode",
  "Таймеры ячеек включаются только для Worker Google, сверенного офлайн. После переключения таблица перезагрузится.": "Cell timers turn on only for a Google Worker verified offline. The spreadsheet reloads after you switch.",
  "устарел": "stale",
  "Настройка замеров недоступна: браузер запретил localStorage.": "Measurement settings are unavailable: the browser blocked localStorage.",
  "Откройте Google-таблицу.": "Open a Google spreadsheet.",
  "Откройте Google Таблицу.": "Open a Google spreadsheet.",
  "Дождитесь загрузки таблицы.": "Wait for the spreadsheet to load.",
  "Панель ещё загружается. Повторите открытие через несколько секунд.": "The panel is still loading. Try again in a few seconds.",
  "Список листов недоступен.": "The sheet list is unavailable.",
  "Список листов этой сборки недоступен.": "The sheet list is unavailable in this Google build.",
  "Размеры листов изменились или недоступны.": "Sheet sizes changed or are unavailable.",
  "Размер книги превышает известный лимит; счётчик требует проверки.": "The spreadsheet exceeds the known limit; the counter needs checking.",
  "Счётчик ячеек недоступен.": "The cell counter is unavailable.",
  "Сумма фаз и максимумы ячеек с раннего подключения к Worker. Пропущенные результаты не восстанавливаются.": "Stage totals and cell maximums since the script connected to the Worker. Missed results are not recovered.",
  "Дождитесь текущего расчёта Sheets.": "Wait for the current Sheets calculation to finish.",
  "Выберите существующий лист.": "Pick an existing sheet.",
  "Очередь расчёта этой версии недоступна.": "The calculation queue is unavailable in this version.",
  "Лист этого типа не поддерживается.": "This kind of sheet is not supported.",
  "Запуск расчёта уже выполняется.": "A calculation is already starting.",
  "Адрес ячейки недоступен.": "Cell address unavailable.",
  "Изменилась схема результатов Sheets.": "The Sheets result format changed.",
  "Неизвестная схема фазы расчёта.": "Unknown calculation stage format.",
  "Неожиданный размер списка ячеек.": "Unexpected cell list size.",
  "Неизвестная схема времени ячейки.": "Unknown cell timing format.",
  "Изменилась схема статистики Worker Google.": "Google’s Worker statistics format changed.",
  "Изменилась схема фаз Worker Google.": "Google’s Worker stage format changed.",
  "Изменилась схема адресных замеров Worker Google.": "Google’s Worker per-cell format changed.",
  "Неизвестная схема экспериментальных метрик.": "Unknown experimental metrics format.",
  "Неизвестная схема экспериментальной фазы.": "Unknown experimental stage format.",
  "Неизвестный или повторный тип экспериментальной фазы.": "Unknown or repeated experimental stage type.",
  "Структура расчёта Google изменилась. Автопоиск не нашёл подтверждённую цепочку. Нужна проверка адаптера.": "Google changed how calculation works. Auto-discovery found no confirmed path. The adapter needs a check.",
  "Функция Sheets недоступна ({role}, {build}).": "Sheets function unavailable ({role}, {build}).",
  "Google изменил функцию ({role}, {build}). Нужна проверка адаптера.": "Google changed a function ({role}, {build}). The adapter needs a check.",
  "Изменилась регистрация панели Google.": "Google changed how its panel is registered.",
  "Google изменил источник связей ({role}). Нужна проверка совместимости.": "Google changed the link source ({role}). A compatibility check is needed.",
  "{label} не найден однозначно.": "{label} was not found unambiguously.",
  "Функция связей ({role})": "Link function ({role})",
  "Объект связей недоступен ({key}).": "Link object unavailable ({key}).",
  "Метод связей ({role})": "Link method ({role})",
  "Поле связей ({role}) не найдено однозначно.": "Link field ({role}) was not found unambiguously.",
  "Фрагмент без @: {snippet}": "Snippet without @: {snippet}",
  "Фрагмент не найден в эталоне: {snippet}": "Snippet not found in the reference: {snippet}",
  "Вкладка браузера скрыта.": "The browser tab is hidden.",
  "Связи в режиме фильтра пока недоступны.": "Links are not available in filter view yet.",
  "Выберите одну ячейку в таблице.": "Select a single cell in the spreadsheet.",
  "Не удалось определить выбранный лист.": "Could not tell which sheet is selected.",
  "Данные листа ещё не загружены.": "The sheet data is not loaded yet.",
  "Ячейка вне загруженного листа.": "The cell is outside the loaded sheet.",
  "Нет обратного индекса этого листа.": "This sheet has no reverse index.",
  "Обратный индекс недоступен.": "The reverse index is unavailable.",
  "Направление обратного индекса не подтверждено.": "The reverse index direction is not confirmed.",
  "Дерево обратных связей недоступно.": "The reverse link tree is unavailable."
};

// userscript/src/ui/i18n.js
var dictionaries = { en };
var current = "ru";
function t(text, params) {
  const template = dictionaries[current]?.[text] ?? text;
  return params ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params) ? String(params[name]) : match) : template;
}

// userscript/src/native/shapes.js
var tokenPattern = /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S/g;
var identifierPattern = /^[A-Za-z_$][\w$]*$/;
var keywords = new Set(("break case catch class const continue debugger default delete do else export extends " + "false finally for function if import in instanceof let new null return super switch this throw true try " + "typeof var void while with yield async await of undefined arguments").split(" "));
var messageId = /^"[A-Za-z0-9$]{1,3}[_`0-9]"$/;
var source = (fn) => typeof fn === "function" ? Function.prototype.toString.call(fn) : "";
var isName = (token) => identifierPattern.test(token) && !keywords.has(token);
var arrowSensitive = new Set(["this", "arguments", "super"]);
function plainArrows(tokens) {
  const out = [];
  for (let i = 0;i < tokens.length; i++) {
    if (tokens[i] !== "=" || tokens[i + 1] !== ">" || tokens[i + 2] !== "{" || !out.length) {
      out.push(tokens[i]);
      continue;
    }
    let from = -1;
    const last = out[out.length - 1];
    if (last === ")") {
      from = out.length - 2;
      while (from >= 0 && (isName(out[from]) || out[from] === ","))
        from--;
      if (out[from] !== "(")
        from = -1;
    } else if (isName(last) && out[out.length - 2] !== ".")
      from = out.length - 1;
    let end = i + 2, depth = 0;
    for (;end < tokens.length; end++) {
      if (tokens[end] === "{")
        depth++;
      else if (tokens[end] === "}" && !--depth)
        break;
    }
    if (from < 0 || end >= tokens.length || tokens.slice(i + 3, end).some((token) => arrowSensitive.has(token))) {
      out.push(tokens[i]);
      continue;
    }
    const params = out.splice(from);
    out.push("function", ...params[0] === "(" ? params : ["(", ...params, ")"], "{");
    i += 2;
  }
  return out;
}
var tokenize = (text) => plainArrows(text.match(tokenPattern) ?? []);
var plainArrowSource = (text) => !text.includes("=>") ? text : tokenize(text).reduce((out, token) => out + (/[\w$]$/.test(out) && /^[\w$]/.test(token) ? " " : "") + token, "");
function withoutInitCalls(tokens) {
  const body = tokens.indexOf("{");
  if (body < 0)
    return tokens;
  let end = body + 1;
  while (isName(tokens[end]) && tokens[end + 1] === "(" && tokens[end + 2] === ")" && tokens[end + 3] === ";")
    end += 4;
  return end === body + 1 ? tokens : [...tokens.slice(0, body + 1), ...tokens.slice(end)];
}
function normalized(text, { messageIds = false, keepKeywords = false, skipInit = false } = {}) {
  return (skipInit ? withoutInitCalls(tokenize(text)) : tokenize(text)).map((token) => identifierPattern.test(token) && (!keepKeywords || !keywords.has(token)) ? "N" : messageIds && messageId.test(token) ? '"I"' : token).join(" ");
}
async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hasShape(fn, expected, options) {
  return typeof fn === "function" && await sha256(normalized(source(fn), options)) === expected;
}
function align(reference, live) {
  const a = tokenize(reference), b = tokenize(live);
  if (a.length !== b.length)
    return null;
  for (let i = 0;i < a.length; i++) {
    const x = a[i], y = b[i];
    if (isName(x) ? !isName(y) : x !== y && !(messageId.test(x) && messageId.test(y)))
      return null;
  }
  return {
    at(snippet) {
      const parts = tokenize(snippet), target = parts.indexOf("@");
      if (target < 0)
        throw Error(t("Фрагмент без @: {snippet}", { snippet }));
      parts.splice(target, 1);
      for (let i = 0;i + parts.length <= a.length; i++)
        if (parts.every((part, j) => a[i + j] === part))
          return b[i + target];
      throw Error(t("Фрагмент не найден в эталоне: {snippet}", { snippet }));
    }
  };
}

// userscript/src/native/glue-anchors.js
var expected = { execMsg: 1, onmessage: 1, postMsg: 1, wbParam: 2, instantiate: 2, loadData: 1, ready: 1, imports: 6 };
var wordAt = /[A-Za-z_$][\w$]*/y;
var numberAt = /\d+(?:\.\d+)?/y;
var stringAt = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/y;
var spaceAt = /\s+/y;
var closers = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
var regexAfter = new Set("return typeof instanceof in of new delete void throw case do else yield await".split(" "));
var divides = (previous) => previous !== undefined && !regexAfter.has(previous) && (/^[\w$"'`)\]}]/.test(previous) || previous.length > 1 && previous[0] === "/");
var sticky = (pattern, text, at) => {
  pattern.lastIndex = at;
  return pattern.exec(text)?.[0];
};
function regexEnd(text, from) {
  for (let i = from + 1, inClass = false;i < text.length; i++) {
    const c = text[i];
    if (c === `
`)
      break;
    if (c === "\\")
      i++;
    else if (c === "[")
      inClass = true;
    else if (c === "]")
      inClass = false;
    else if (c === "/" && !inClass) {
      i++;
      while (/[a-z]/i.test(text[i] ?? ""))
        i++;
      return i;
    }
  }
  throw Error("unterminated regex literal at " + from);
}
function templateEnd(text, from) {
  for (let i = from + 1;i < text.length; i++) {
    if (text[i] === "\\")
      i++;
    else if (text[i] === "`")
      return i + 1;
    else if (text[i] === "$" && text[i + 1] === "{")
      i = scan(text, i + 2, true).end - 1;
  }
  throw Error("unterminated template");
}
function scan(text, from = 0, nested = false) {
  const tokens = [], open = [];
  let i = from;
  while (i < text.length) {
    const space = sticky(spaceAt, text, i);
    if (space) {
      i += space.length;
      continue;
    }
    const c = text[i], previous = tokens[tokens.length - 1];
    let token;
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0)
        throw Error("unterminated comment");
      i = end + 2;
      continue;
    } else if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf(`
`, i);
      i = end < 0 ? text.length : end;
      continue;
    } else if (c === "/" && !divides(previous)) {
      token = text.slice(i, regexEnd(text, i));
    } else if (c === '"' || c === "'") {
      token = sticky(stringAt, text, i);
      if (!token)
        throw Error("unterminated string");
    } else if (c === "`")
      token = text.slice(i, templateEnd(text, i));
    else
      token = sticky(wordAt, text, i) ?? sticky(numberAt, text, i) ?? c;
    i += token.length;
    if (closers.has(token))
      open.push(closers.get(token));
    else if (token === ")" || token === "]" || token === "}") {
      if (!open.length && nested && token === "}")
        return { tokens, end: i };
      if (open.pop() !== token)
        throw Error("unbalanced brackets");
    }
    tokens.push(token);
  }
  if (open.length || nested)
    throw Error("unbalanced brackets");
  return { tokens, end: i };
}
var blockStatements = new Set(["function", "class", "if", "for", "while", "switch", "try", "with", "{"]);
var continuations = new Set(["else", "catch", "finally"]);
function statements(tokens) {
  const found = [];
  let from = 0, depth = 0;
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (closers.has(token))
      depth++;
    else if (token === ")" || token === "]" || token === "}")
      depth--;
    if (depth || !(token === ";" || token === "}" && blockStatements.has(tokens[from])) || continuations.has(tokens[i + 1]))
      continue;
    if (i + 1 - from > 1 || token !== ";")
      found.push([from, i + 1]);
    from = i + 1;
  }
  if (from < tokens.length)
    found.push([from, tokens.length]);
  return found;
}
function matching(tokens, open) {
  for (let i = open, depth = 0;i < tokens.length; i++) {
    if (closers.has(tokens[i]))
      depth++;
    else if ((tokens[i] === ")" || tokens[i] === "]" || tokens[i] === "}") && !--depth)
      return i;
  }
  return -1;
}
function shape(tokens) {
  const names = new Map;
  return tokens.map((token) => messageId.test(token) ? '"M"' : !isName(token) ? token : /^[A-Za-z]{4,}$/.test(token) ? token : (names.has(token) || names.set(token, "v" + names.size), names.get(token))).join(" ");
}
function facts(tokens, from, to) {
  const found = { members: new Set, strings: new Set, onmessage: false, postArray: false, props: [] };
  for (let i = from;i < to; i++) {
    const token = tokens[i], next = tokens[i + 1];
    if (token === "." && tokens[i - 1] !== "." && isName(next)) {
      found.members.add(next);
      if (next === "onmessage" && tokens[i + 2] === "=" && tokens[i + 3] === "function") {
        let at = i + 4;
        if (isName(tokens[at]))
          at++;
        const params = tokens[at] === "(" ? matching(tokens, at) : -1;
        const end = params > 0 && tokens[params + 1] === "{" ? matching(tokens, params + 1) : -1;
        for (let k = at;end > 0 && k < end; k++)
          if (tokens[k] === "." && tokens[k + 1] === "data")
            found.onmessage = true;
      }
    } else if (token === "postMessage" && next === "(" && tokens[i + 2] === "[" && tokens[i - 1] !== ".")
      found.postArray = true;
    else if (token[0] === '"' || token[0] === "'") {
      found.strings.add(token.slice(1, -1));
      if (next === ":" && (tokens[i - 1] === "{" || tokens[i - 1] === ",") && /calcworker\.(util|XhrRequest)\./.test(token)) {
        let end = i + 2;
        for (let depth = 0;end < to; end++) {
          if (closers.has(tokens[end]))
            depth++;
          else if (tokens[end] === ")" || tokens[end] === "]" || tokens[end] === "}") {
            if (!depth--)
              break;
          } else if (tokens[end] === "," && !depth)
            break;
        }
        found.props.push({ key: token.slice(1, -1), value: [i + 2, end] });
      }
    }
  }
  return found;
}
function isReadyCall(tokens, [from, to]) {
  const tail = ", [ Date . now ( ) ] ) ;".split(" ");
  if (!(isName(tokens[from]) && tokens[from + 1] === "(" && tokens[to - 1] === ";" && to - from > tail.length + 3))
    return false;
  if (!tail.every((token, k) => tokens[to - tail.length + k] === token) || matching(tokens, from + 1) !== to - 2)
    return false;
  let commas = 0;
  for (let i = from + 2, depth = 0;i < to - tail.length; i++) {
    if (closers.has(tokens[i]))
      depth++;
    else if (tokens[i] === ")" || tokens[i] === "]" || tokens[i] === "}")
      depth--;
    else if (tokens[i] === "," && !depth)
      commas++;
  }
  return commas === 1;
}
function declarations(tokens, list) {
  const found = new Map;
  for (const [from, to] of list) {
    if (tokens[from] === "function" && isName(tokens[from + 1]))
      found.set(tokens[from + 1], [from, to]);
    else if (["var", "let", "const"].includes(tokens[from])) {
      const end = tokens[to - 1] === ";" ? to - 1 : to;
      for (let start = from + 1, i = from + 1, depth = 0;i <= end; i++) {
        if (i < end && closers.has(tokens[i]))
          depth++;
        else if (i < end && (tokens[i] === ")" || tokens[i] === "]" || tokens[i] === "}"))
          depth--;
        else if (i === end || tokens[i] === "," && !depth) {
          if (isName(tokens[start]) && tokens[start + 1] === "=")
            found.set(tokens[start], [start + 2, i]);
          start = i + 1;
        }
      }
    }
  }
  return found;
}
function read(text) {
  const tokens = plainArrows(scan(String(text).replace(/^\uFEFF/, "")).tokens);
  return { tokens, list: statements(tokens) };
}
function anchorGroups(tokens, list) {
  const groups = { execMsg: [], onmessage: [], postMsg: [], wbParam: [], instantiate: [], loadData: [], ready: [] };
  const paramMap = [], props = [];
  let tailFrom = -1;
  list.forEach((range, index) => {
    const [from, to] = range, found = facts(tokens, from, to);
    if (found.members.has("onmessageNativeJs"))
      groups.execMsg.push(range);
    if (found.onmessage)
      groups.onmessage.push(range);
    if (found.postArray)
      groups.postMsg.push(range);
    if (found.members.has("_workerInitializationParamMap") || found.strings.has("wb") && found.members.has("search"))
      groups.wbParam.push(range);
    if (found.members.has("_workerInitializationParamMap")) {
      paramMap.push(range);
      if (tailFrom < 0)
        tailFrom = index;
    }
    if (found.strings.has("string.consts") || found.strings.has("js-prototypes"))
      groups.instantiate.push(range);
    if (found.members.has("setInitialLoadData"))
      groups.loadData.push(range);
    if (isReadyCall(tokens, range))
      groups.ready.push(range);
    props.push(...found.props);
  });
  return { groups, paramMap, props, tailFrom };
}
async function anchoredGlueDigest(text) {
  let tokens, list;
  try {
    ({ tokens, list } = read(text));
  } catch (error) {
    return { sha256: null, missing: [`scan: ${error.message}`] };
  }
  const { groups, props, tailFrom } = anchorGroups(tokens, list);
  const lines = {}, missing = [];
  for (const [name, ranges] of Object.entries(groups))
    lines[name] = ranges.map(([from, to]) => shape(tokens.slice(from, to)));
  const declared = props.some(({ value: [from, to] }) => to - from === 1 && isName(tokens[from])) ? declarations(tokens, list) : null;
  lines.imports = props.map(({ key, value: [from, to] }) => {
    let range = [from, to];
    if (to - from === 1 && isName(tokens[from])) {
      range = declared.get(tokens[from]);
      if (!range) {
        missing.push(`imports: ${key} is bound to an unknown ${tokens[from]}`);
        return key;
      }
    }
    return key + "=" + shape(tokens.slice(range[0], range[1]));
  }).sort();
  lines.tail = tailFrom < 0 ? [] : list.slice(tailFrom).map(([from, to]) => shape(tokens.slice(from, to)));
  for (const name of Object.keys(lines)) {
    const count = lines[name].length;
    if (name === "tail" ? !count : count !== expected[name])
      missing.push(count ? `${name} x${count}, expected ${expected[name]}` : name);
  }
  if (missing.length)
    return { sha256: null, missing };
  return { sha256: await sha256(Object.entries(lines).map(([name, items]) => name + `
` + items.join(`
`)).join(`
`)), missing };
}
var isClose = (token) => token === ")" || token === "]" || token === "}";
function matchingBack(tokens, close) {
  for (let i = close, depth = 0;i >= 0; i--) {
    if (isClose(tokens[i]))
      depth++;
    else if (closers.has(tokens[i]) && !--depth)
      return i;
  }
  return -1;
}
function innermost(tokens, from, to, at) {
  let start = from, end = to;
  for (let i = at - 1, depth = 0;i >= from; i--) {
    const token = tokens[i];
    if (isClose(token)) {
      if (token === "}" && !depth) {
        start = i + 1;
        break;
      }
      depth++;
    } else if (closers.has(token)) {
      if (depth)
        depth--;
      else if (token === "{") {
        start = i + 1;
        break;
      }
    } else if (token === ";" && !depth) {
      start = i + 1;
      break;
    }
  }
  for (let i = at, depth = 0;i < to; i++) {
    const token = tokens[i];
    if (closers.has(token))
      depth++;
    else if (isClose(token)) {
      if (depth)
        depth--;
      else if (token === "}") {
        end = i;
        break;
      }
    } else if (token === ";" && !depth) {
      end = i + 1;
      break;
    }
  }
  return [start, end];
}
function callees(tokens, [from, to], declared, names) {
  for (let i = from;i < to; i++) {
    const token = tokens[i];
    if (token === "throw") {
      for (let depth = 0;i < to; i++) {
        if (closers.has(tokens[i]))
          depth++;
        else if (isClose(tokens[i])) {
          if (!depth)
            break;
          depth--;
        } else if (tokens[i] === ";" && !depth)
          break;
      }
    } else if (isName(token) && tokens[i - 1] !== "." && declared.has(token) && (tokens[i + 1] === "(" || tokens[i - 1] === "new"))
      names.add(token);
  }
}
var blockHeads = new Set(["if", "for", "while", "with"]);
var declarationHeads = new Set(["var", "let", "const", "function", "class"]);
var dropSemicolons = (tokens) => tokens.filter((token, i) => token !== ";" || tokens[i + 1] !== "}");
function canon(input) {
  let tokens = [];
  for (let i = 0;i < input.length; i++) {
    tokens.push(input[i]);
    if (input[i] !== "new" || !isName(input[i + 1]))
      continue;
    let j = i + 1;
    tokens.push(input[j]);
    while (input[j + 1] === "." && isName(input[j + 2])) {
      tokens.push(".", input[j + 2]);
      j += 2;
    }
    if (input[j + 1] !== "(")
      tokens.push("(", ")");
    i = j;
  }
  tokens = dropSemicolons(tokens);
  for (let changed = true;changed; ) {
    changed = false;
    for (let k = 0;k < tokens.length; k++) {
      if (tokens[k] !== "{")
        continue;
      const previous = tokens[k - 1];
      let unwrap = previous === "else" || previous === "do";
      if (previous === ")") {
        const open = matchingBack(tokens, k - 1);
        unwrap = open > 0 && blockHeads.has(tokens[open - 1]);
      }
      const end = unwrap ? matching(tokens, k) : -1;
      if (end < 0)
        continue;
      const body = tokens.slice(k + 1, end);
      if (!body.length || declarationHeads.has(body[0]))
        continue;
      let single = true;
      for (let m = 0, depth = 0;m < body.length && single; m++) {
        if (closers.has(body[m]))
          depth++;
        else if (isClose(body[m]))
          depth--;
        else if (body[m] === ";" && !depth)
          single = false;
      }
      if (!single)
        continue;
      tokens = dropSemicolons([...tokens.slice(0, k), ...body, ";", ...tokens.slice(end + 1)]);
      changed = true;
      break;
    }
  }
  return tokens;
}
function canonicalShape(tokens, [from, to]) {
  const canonical = canon(tokens.slice(from, to));
  if (canonical.at(-1) === ";")
    canonical.pop();
  return shape(canonical);
}
var payloadNames = new Set([
  "setInitialLoadData",
  "initialize",
  "performanceTimingEntries",
  "performanceTimeOrigin",
  "instantiateFailureCount",
  "latencyCheckpointEntries",
  "latencyDurationEntries"
]);
var singleParts = new Set(["execMsg", "onmessage", "postMsg", "ready", "postImport"]);
var quotedWb = new Set(['"wb"', "'wb'"]);
async function canonicalGlueDigest(text) {
  let tokens, list;
  try {
    ({ tokens, list } = read(text));
  } catch (error) {
    return { sha256: null, missing: [`scan: ${error.message}`] };
  }
  const { groups, paramMap, props } = anchorGroups(tokens, list);
  const declared = declarations(tokens, list), missing = [];
  const seen = new Set, wbReads = [], loadCalls = [], payload = [], latency = [];
  const once = (into, range) => {
    const key = range.join(":");
    if (!seen.has(key)) {
      seen.add(key);
      into.push(range);
    }
  };
  for (const [from, to] of groups.wbParam)
    for (let i = from;i < to; i++)
      if (quotedWb.has(tokens[i]))
        wbReads.push(innermost(tokens, from, to, i));
  for (const [from, to] of groups.loadData)
    for (let i = from;i < to; i++) {
      if (tokens[i] === "setInitialLoadData" && tokens[i - 1] === ".")
        loadCalls.push(innermost(tokens, from, to, i));
      if (payloadNames.has(tokens[i]))
        once(payload, innermost(tokens, from, to, i));
    }
  for (const [from, to] of list)
    for (let i = from + 1;i < to - 2; i++)
      if (tokens[i - 1] === "[" && tokens[i + 1] === "]" && tokens[i + 2] === "=" && tokens[i + 3] !== "=" && /^1\d{5}$/.test(tokens[i]))
        once(latency, innermost(tokens, from, to, i));
  const names = new Set;
  for (const range of [...groups.execMsg, ...groups.onmessage, ...groups.postMsg, ...loadCalls, ...groups.ready])
    callees(tokens, range, declared, names);
  const S = (range) => canonicalShape(tokens, range);
  const postImport = props.filter(({ key }) => /\.postMessageNativeJs$/.test(key)).map(({ key, value: [from, to] }) => {
    const range = to - from === 1 && isName(tokens[from]) ? declared.get(tokens[from]) : [from, to];
    if (!range)
      missing.push(`postImport: ${key} is bound to an unknown ${tokens[from]}`);
    return range ? key + "=" + S(range) : key;
  });
  const parts = {
    execMsg: groups.execMsg.map(S),
    onmessage: groups.onmessage.map(S),
    postMsg: groups.postMsg.map(S),
    wbParam: [...paramMap, ...wbReads].map(S),
    loadData: payload.map(S),
    ready: groups.ready.map(S),
    importKeys: props.map(({ key }) => key).sort(),
    postImport,
    callees: [...names].map((name) => S(declared.get(name))),
    latency: latency.map(S).sort()
  };
  for (const [name, items] of Object.entries(parts)) {
    const count = items.length;
    if (singleParts.has(name) ? count !== 1 : !count)
      missing.push(count ? `${name} x${count}, expected 1` : name);
  }
  if (missing.length)
    return { sha256: null, missing };
  return { sha256: await sha256(Object.entries(parts).map(([name, items]) => name + `
` + items.join(`
`)).join(`
`)), missing };
}

// userscript/src/native/workers.js
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
  },
  {
    host: "/3494893496-calcworkerhost_core.js",
    wasm: "/1490220236-calcworker_wasm.wasm",
    stats: true,
    counters: true,
    evidence: "research/native-build-2026-09-29-firefox-manifest.json"
  }
];
var verifiedGlue = [
  {
    sha256: "6bcf40ff27a63790e6184f4a81d2b1d6f5d165518fb23768d28f90b0acd055ed",
    evidence: "research/native-build-2026-09-29-manifest.json"
  },
  {
    sha256: "6addda89a4371f2f4324cb1b83a91789e77b311d4be7dc84ae89efd4d1f1d9e8",
    evidence: "research/native-build-ggV6-manifest.json"
  },
  {
    sha256: "513b0e47620d6cb490f5788a7325eb5b906053dd9aec16e3cb0bc4d4e95a737e",
    evidence: "research/native-build-2026-09-29-firefox-manifest.json"
  }
];
var verifiedAnchors = [
  {
    variant: "cd",
    sha256: "9499557da834a888cf7e19996d2b435feb9a1ce4734f7bbd8b47552001a1201e",
    evidence: "research/native-build-ggV6-manifest.json, research/native-build-2026-09-23-manifest.json, research/native-build-2026-09-25-manifest.json, research/native-build-2026-09-29-manifest.json, research/native-build-2026-10-06-manifest.json, research/native-build-2026-10-06-Mm_qTNRMLew-manifest.json, research/native-build-2026-10-10-manifest.json"
  },
  {
    variant: "core",
    sha256: "8598c5fbb981b763ef6a629b47d118292710e0f4d03527cbdb66ebb57a6d5af5",
    evidence: "research/native-build-2026-09-29-firefox-manifest.json, research/native-build-2026-10-06-manifest.json, research/native-build-2026-10-10-manifest.json"
  },
  {
    variant: "cd",
    sha256: "9d2daf933f9e1cd68706d2139763ec315d8b542d92a9d5a33bddb18263c5b701",
    evidence: "research/native-build-2026-10-13-manifest.json"
  },
  {
    variant: "core",
    sha256: "9587f241cf40b896e0cfe7621d965d768d8319ba8e60fd38c3c1f202b912d5f0",
    evidence: "research/native-build-2026-10-13-manifest.json"
  }
];
var verifiedCanonical = [
  {
    sha256: "821b503e3c4e2efb443769a959869b866b7a8e0be1de587fdc73eef8d35238ac",
    evidence: "research/native-build-ggV6-manifest.json, research/native-build-2026-09-23-manifest.json, research/native-build-2026-09-25-manifest.json, research/native-build-2026-09-29-manifest.json, research/native-build-2026-09-29-firefox-manifest.json, research/native-build-2026-10-06-manifest.json, research/native-build-2026-10-06-Mm_qTNRMLew-manifest.json, research/native-build-2026-10-10-manifest.json, research/native-build-2026-10-13-manifest.json"
  }
];
var extensionHost = workers.find((worker) => worker.extension).host;

// tools/native-build/google-page.mjs
var origin = "https://docs.google.com";
var defaultSheet = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
var userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
var sha2562 = (data) => createHash("sha256").update(data).digest("hex");
var sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function get(path, tries = 3) {
  const url = path.startsWith("https://") ? path : origin + path;
  if (new URL(url).origin !== origin)
    throw Error(`refusing non-Google URL ${url}`);
  for (let attempt = 1;; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": userAgent, "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(90000) });
      if (!response.ok)
        throw Object.assign(Error(`HTTP ${response.status}`), { final: response.status < 500 });
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= tries || error.final)
        throw Error(`${url}: ${error.message}`);
      await sleep(1000 * attempt);
    }
  }
}
var unescapeHtml = (text) => text.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replaceAll("\\/", "/");
function parsePage(html) {
  let text = unescapeHtml(html);
  for (const [, wb] of text.matchAll(/\?wb=([\w%-]+)/g)) {
    try {
      text += `
` + Buffer.from(decodeURIComponent(wb), "base64").toString("utf8");
    } catch {}
  }
  const modules = new Map;
  for (const [path, name] of text.matchAll(/\/_\/spreadsheets\/_\/js\/k=[^\s"'\\]+?\/m=([a-z0-9_]+)/g))
    if (!modules.has(name))
      modules.set(name, path);
  const k = /k=([^/]+)/.exec(modules.get("core") ?? "")?.[1] ?? "";
  const parts = k.split("."), es5 = parts.indexOf("es5");
  const keys = new Set([...modules.values()].map((path) => /k=([^/]+)/.exec(path)[1]));
  const workers2 = new Map;
  for (const match of text.matchAll(/\/(?:spreadsheets\/j2clritzapp\/static\/client|static\/spreadsheets2\/client)\/js\/(\d+)-(calcworker\w*)\.js/g)) {
    const id = `${match[1]}-${match[2]}`;
    if (!workers2.has(id) || match[0].startsWith("/spreadsheets/"))
      workers2.set(id, { id, number: match[1], name: match[2], path: match[0] });
  }
  const wasms = new Map;
  for (const match of text.matchAll(/\/static\/spreadsheets2\/client\/wasm\/(\d+)-(calcworker\w*)\.wasm/g))
    wasms.set(`${match[1]}-${match[2]}`, { id: `${match[1]}-${match[2]}`, number: match[1], name: match[2], path: match[0] });
  return {
    modules,
    multiple: keys.size > 1,
    bundleKey: parts[1],
    locale: parts.slice(2, es5 - 1).join("."),
    build: parts[es5 - 1],
    workers: [...workers2.values()],
    wasms: [...wasms.values()],
    customDescriptorsFlag: /"fecwwcd":(true|false)/.exec(text)?.[1] ?? null
  };
}
var usablePage = (page) => Boolean(page.build && page.modules.has("core") && page.modules.has("ritzmain") && !page.multiple);
function classify(entry, wasm) {
  if (wasm)
    return entry.name.endsWith("_cd") ? { variant: "cd", role: "wasm", file: "engine-cd.wasm" } : { variant: "core", role: "wasm", file: "engine.wasm" };
  if (entry.name.startsWith("calcworkerhost_custom_descriptors"))
    return { variant: "cd", role: "host", file: "host.js" };
  if (entry.name === "calcworkerhost_core")
    return { variant: "core", role: "host", file: "host-core.js" };
  if (entry.name.startsWith("calcworker_j2cl"))
    return { variant: "j2cl", role: "fallback", file: "worker-j2cl-core.js" };
  return { variant: null, role: "other", file: `other-${entry.id}${wasm ? ".wasm" : ".js"}` };
}
var normalizeGlue = (text) => text.replace(/^\uFEFF/, "").replace(/[0-9]+/g, "0");
var glueDigest = (buffer) => sha2562(Buffer.from(normalizeGlue(buffer.toString("utf8")), "utf8"));
async function digestVerdict(digestOf, rows, buffer) {
  const { sha256: digest, missing } = await digestOf(buffer.toString("utf8"));
  if (!digest)
    return { verdict: `missing:${missing.join(",")}`, missing };
  const row = rows.find((item) => item.sha256 === digest);
  return row ? { verdict: "accepted", sha256: digest, evidence: row.evidence } : { verdict: "changed", sha256: digest };
}
var anchorsVerdict = (buffer) => digestVerdict(anchoredGlueDigest, verifiedAnchors, buffer);
var canonicalVerdict = (buffer) => digestVerdict(canonicalGlueDigest, verifiedCanonical, buffer);

// tools/native-build/offline-discovery.mjs
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";

// userscript/src/native/discovery.js
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
  ns: "b9d726c12ea20ddaa7b399037ce9049d06d5c8fa3af8e2c2da8d544977351fd7",
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
var own = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
var hash = sha256;
function readerFields(g, names, bookGrid) {
  const patterns = {
    storage: new RegExp(`^function ${identifier}\\(a\\)\\{${identifier}\\(a\\.(${identifier})\\.(${identifier})\\(\\),"Chunk %s is not loaded",a\\.${identifier}\\);return a\\.\\1\\}$`),
    cell: new RegExp(`^function ${identifier}\\(a,c\\)\\{return a\\.${bookGrid.replace(/\$/g, "\\$")}\\(c\\.${identifier}\\)\\.(${identifier})\\(c\\.${identifier},c\\.${identifier}\\)\\}$`),
    sheetName: new RegExp(`for\\(a=a\\.${identifier}\\.${identifier}\\(\\);a\\.${identifier}\\(\\);\\)\\{let e=a\\.${identifier}\\(\\);if\\(${identifier}\\(c,e\\.${identifier}\\.(${identifier})\\.(${identifier})\\)\\)return e\\.${identifier}\\}return null\\}$`)
  };
  const found = { storage: new Set, cell: new Set, sheetName: new Set };
  for (const name of names) {
    const fn = own(g, name);
    if (typeof fn !== "function" || fn.length > 2)
      continue;
    const body = source(fn);
    if (body.length > 200)
      continue;
    for (const [role, pattern] of Object.entries(patterns)) {
      const match = body.match(pattern);
      if (match)
        found[role].add(JSON.stringify(match.slice(1)));
    }
  }
  const one = (role) => found[role].size === 1 ? JSON.parse([...found[role]][0]) : null;
  const storage = one("storage"), cell = one("cell"), sheetName = one("sheetName");
  return { storage: storage?.[0], storageReady: storage?.[1], cell: cell?.[0], sheetNamePath: sheetName ?? undefined };
}
function registrationIn(app, g) {
  if (!app || typeof app !== "object")
    return null;
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(app))) {
    const shell = descriptor.value;
    if (!shell || typeof shell !== "object")
      continue;
    const code = source(shell.constructor);
    const match = code.match(new RegExp(`\\.${identifier}\\((?:"fept"|'fept')\\)&&(${identifier})\\(this\\.(${identifier}),new (${identifier})\\(`));
    if (!match)
      continue;
    const [, registerName, hostField, wrapperName] = match;
    const register = own(g, registerName), wrapper = own(g, wrapperName);
    if (typeof register !== "function" || typeof wrapper !== "function")
      continue;
    const registryField = source(register).match(/a\.([A-Za-z_$][\w$]*)\.set\(/)?.[1];
    const host = own(shell, hostField);
    if (!registryField || !(own(host, registryField) instanceof Map))
      continue;
    const start = match.index + match[0].length;
    let depth = 1, end = start;
    for (;end < code.length && depth; end++) {
      if (code[end] === "(")
        depth++;
      else if (code[end] === ")")
        depth--;
    }
    if (depth)
      continue;
    const args = [], contents = code.slice(start, end - 1);
    let level = 0, from = 0;
    for (let i = 0;i <= contents.length; i++) {
      const char = contents[i];
      if (char === "(")
        level++;
      else if (char === ")")
        level--;
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
    if (args.length !== 11)
      continue;
    return { appShell: key, hostField, registryField, registerName, wrapperName, args };
  }
  return null;
}
async function discoverNativeBuild(g, trace = null) {
  const note = (step, detail) => {
    trace?.(step, detail);
  };
  const names = Object.getOwnPropertyNames(g);
  const providers = new Set;
  for (const name of names) {
    const fn = own(g, name);
    if (typeof fn === "function" && fn.length === 0 && new RegExp(`^function ${identifier}\\(\\)\\{return ${identifier}\\("ritzmain"\\)\\}$`).test(source(fn)))
      providers.add(name);
  }
  note("providers", [...providers]);
  if (!providers.size)
    return null;
  const candidates = [];
  for (const name of names) {
    const fn = own(g, name);
    if (typeof fn !== "function" || fn.length !== 0)
      continue;
    const match = source(fn).match(new RegExp(`^function ${identifier}\\(\\)\\{return (${identifier})\\(\\)\\.${identifier}\\(\\)\\}$`));
    if (match && providers.has(match[1]))
      candidates.push([name, fn]);
  }
  note("getterCandidates", candidates.map(([name]) => name));
  if (candidates.length > 20)
    return null;
  for (const [getterName, getter] of candidates) {
    const miss = (reason) => note("candidate", { getter: getterName, rejected: reason });
    let model;
    try {
      model = Reflect.apply(getter, g, []);
    } catch (error) {
      miss(`getter threw: ${error?.message}`);
      continue;
    }
    if (!model || typeof model !== "object") {
      miss("getter returned no object");
      continue;
    }
    const prototype = Object.getPrototypeOf(model);
    if (!prototype) {
      miss("model has no prototype");
      continue;
    }
    const functions = Object.getOwnPropertyNames(prototype).map((name) => [name, own(prototype, name)]).filter(([, fn]) => typeof fn === "function");
    const shapeMap = new Map;
    for (const [name, fn] of functions) {
      const key = await hash(normalized(source(fn)));
      if (!shapeMap.has(key))
        shapeMap.set(key, []);
      shapeMap.get(key).push([name, fn]);
    }
    const one = (role) => (shapeMap.get(shapes[role]) ?? []).length === 1 ? shapeMap.get(shapes[role])[0] : null;
    const recalc = one("t4e"), bookGetter = one("wm"), formula = one("NNc"), hasFormula = one("Oqb");
    note("modelShapes", {
      getter: getterName,
      t4e: recalc?.[0] ?? null,
      wm: bookGetter?.[0] ?? null,
      NNc: formula?.[0] ?? null,
      Oqb: hasFormula?.[0] ?? null,
      candidates: Object.fromEntries(["t4e", "wm", "NNc", "Oqb"].map((role) => [role, (shapeMap.get(shapes[role]) ?? []).length]))
    });
    if (!recalc || !bookGetter || !formula || !hasFormula) {
      miss("model has no unique t4e/wm/NNc/Oqb shapes");
      continue;
    }
    const recalcSource = plainArrowSource(source(recalc[1]));
    const [, store, accessor] = recalcSource.match(new RegExp(`^function\\(\\)\\{var a=this\\.(${identifier})\\.(${identifier})\\(\\),`)) ?? [];
    const queue = recalcSource.match(new RegExp(`(${identifier})\\(this\\.(${identifier}),(${identifier}),null,18\\)`));
    const range = recalcSource.match(new RegExp(`function\\((${identifier})\\)\\{${identifier}\\(${identifier},(${identifier})\\(\\1\\.(${identifier})\\)\\)\\}`));
    const chain = recalcSource.match(new RegExp(`(${identifier})\\(this\\.(${identifier}),(${identifier})\\((${identifier})\\((${identifier})\\((${identifier})\\((${identifier})\\(\\),0\\),(${identifier})`));
    note("recalcAnchors", { store: store ?? null, accessor: accessor ?? null, queue: queue?.slice(1) ?? null, range: range?.slice(1) ?? null, chain: chain?.slice(1) ?? null });
    if (!store || !queue || !range || !chain || chain[2] !== store || chain[8] !== "a") {
      miss("recalculation body anchors (store/queue/range/chain) not matched");
      continue;
    }
    const [, Woh, , Fj, oP, DP, pP, qP] = chain;
    const [, jmg, queueField, tmg] = queue;
    const [, , ns, sheetIdField] = range;
    if (queueField === store || !recalcSource.includes(`${oP}(${DP}(${pP}(${qP}(),2),a))`) || !recalcSource.includes(`${oP}(${DP}(${pP}(${qP}(),1),a))`)) {
      miss("command chain (types 2 and 1) or queue field mismatch");
      continue;
    }
    const book = Reflect.apply(bookGetter[1], model, []);
    const bookList = recalcSource.match(new RegExp(`${identifier}\\(a\\.(${identifier})\\(\\)\\)\\.${identifier}\\(`))?.[1];
    const bookPrototype = book && Object.getPrototypeOf(book);
    const bookGrid = bookPrototype && Object.getOwnPropertyNames(bookPrototype).find((name) => source(own(bookPrototype, name)).includes("No sheet found with id %s"));
    note("book", { bookList: bookList ?? null, bookGrid: bookGrid ?? null, book: typeof book });
    if (!book || typeof book !== "object" || !bookList || typeof book[bookList] !== "function" || !bookGrid) {
      miss("book object, list method or grid method not found");
      continue;
    }
    const exists = (shapeMap.get(shapes.oO) ?? []).filter(([, fn]) => {
      const helper = source(fn).match(new RegExp(`return (${identifier})\\(this\\.${store}\\.${accessor}\\(\\),${identifier}\\)`))?.[1];
      return helper && typeof own(g, helper) === "function";
    });
    const verifiedExists = [];
    for (const entry of exists) {
      const helper = source(entry[1]).match(/return ([A-Za-z_$][\w$]*)\(/)?.[1];
      if (await hasShape(own(g, helper), shapes.existsHelper))
        verifiedExists.push(entry);
    }
    const sheetType = (shapeMap.get(shapes.Vod) ?? []).filter(([, fn]) => {
      const method = source(fn).match(new RegExp(`this\\.${store}\\.${accessor}\\(\\)\\.(${identifier})\\(a\\)\\.${identifier}\\(\\)`))?.[1];
      return method && source(own(bookPrototype, method)).includes("Sheet not found");
    });
    note("sheetMethods", { exists: verifiedExists.map(([name]) => name), sheetType: sheetType.map(([name]) => name) });
    if (verifiedExists.length !== 1 || sheetType.length !== 1) {
      miss("oO/Vod not unique");
      continue;
    }
    const globals = { dx: getterName, ns, Woh, Fj, oP, DP, pP, qP, jmg, tmg };
    if (typeof own(g, tmg) !== "object") {
      miss("queue constant is not an object");
      continue;
    }
    const badRoles = [];
    for (const role of ["ns", "Woh", "Fj", "oP", "DP", "pP", "qP", "jmg"])
      if (!await hasShape(own(g, globals[role]), shapes[role], role === "ns" ? { skipInit: true } : undefined))
        badRoles.push(`${role}=${globals[role]}`);
    if (badRoles.length) {
      miss(`helper shape mismatch: ${badRoles.join(", ")}`);
      continue;
    }
    for (const [role, marker] of [["T5h", '"CalcApply"'], ["Abg", '"fecw"'], ["Rl", "NaN"]]) {
      const matches = [];
      for (const name of names) {
        const fn = own(g, name), body = source(fn);
        if (body.includes(marker) && await hasShape(fn, shapes[role], { messageIds: role === "T5h" }))
          matches.push(name);
      }
      if (matches.length === 1)
        globals[role] = matches[0];
    }
    const methods = { t4e: recalc[0], wm: bookGetter[0], oO: verifiedExists[0][0], Vod: sheetType[0][0], NNc: formula[0], Oqb: hasFormula[0] };
    const fingerprints = {};
    for (const [role, name] of Object.entries(globals))
      if (typeof own(g, name) === "function")
        fingerprints[role] = await hash(source(own(g, name)));
    for (const [role, name] of Object.entries(methods))
      fingerprints[role] = await hash(source(own(prototype, name)));
    const registration = registrationIn(g.waffle_api?.getInstanceOfApp?.(), g);
    if (registration) {
      const dispatcher = names.find((name) => source(own(g, name)).includes('"show-performance-tool-sidebar"') && source(own(g, name)).length < 120);
      if (dispatcher && await hasShape(own(g, registration.registerName), shapes.QC) && await hasShape(own(g, registration.wrapperName), shapes.Usd) && await hasShape(own(g, dispatcher), shapes.wtc)) {
        Object.assign(globals, { QC: registration.registerName, Usd: registration.wrapperName, wtc: dispatcher });
        for (const role of ["QC", "Usd", "wtc"])
          fingerprints[role] = await hash(source(own(g, globals[role])));
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
      capacity: "native-grid",
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

// tools/native-build/offline-discovery.mjs
async function discoverOffline(dir) {
  const report = { buildDir: resolve(dir), load: [], harness: {}, steps: [], discovered: false, result: null };
  const finish = (code) => ({ code, report });
  const g = vm.createContext({});
  vm.runInContext("var window=this,self=this;", g);
  const dummy = () => new Proxy(function() {}, {
    get: (_, key) => key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : key === "length" ? 0 : key === "lang" ? "ru" : dummy(),
    apply: () => dummy(),
    construct: () => dummy(),
    set: () => true,
    has: () => true
  });
  Object.assign(g, {
    DOCS_timing: {},
    config: { mssServingEnabled: true },
    document: dummy(),
    navigator: dummy(),
    location: new URL("https://docs.google.com/spreadsheets/d/synthetic/edit"),
    setTimeout,
    console
  });
  for (const file of ["core.js", "ritzmain.js"]) {
    const code = readFileSync(join(dir, file), "utf8");
    try {
      vm.runInContext(code, g, { filename: file });
      report.load.push({ file, bytes: code.length, ok: true });
    } catch (error) {
      const lines = code.trimEnd().split(`
`);
      const lastCodeLine = lines.length - (lines.at(-1).startsWith("//") ? 1 : 0);
      const frames = [...String(error?.stack).matchAll(new RegExp(`${file.replace(".", "\\.")}:(\\d+):\\d+`, "g"))].map((match) => Number(match[1]));
      const failedLine = frames.length ? Math.max(...frames) : null;
      const bootstrapOnly = failedLine !== null && failedLine >= lastCodeLine - 1;
      report.load.push({
        file,
        bytes: code.length,
        ok: bootstrapOnly ? "definitions-complete" : false,
        bootstrapTailError: String(error?.message).slice(0, 120),
        failedLine,
        lastCodeLine
      });
      if (!bootstrapOnly) {
        report.harness.error = `${file} stopped before its end`;
        return finish(2);
      }
    }
  }
  const own2 = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
  const names = Object.getOwnPropertyNames(g);
  const functions = names.filter((name) => typeof own2(g, name) === "function");
  const text = (fn) => Function.prototype.toString.call(fn);
  report.harness.globalFunctions = functions.length;
  const prototypes = functions.map((name) => [name, own2(own2(g, name), "prototype")]).filter(([, p]) => p && typeof p === "object");
  const methodsOf = (proto) => Object.getOwnPropertyNames(proto).filter((key) => typeof own2(proto, key) === "function");
  const modelClasses = prototypes.filter(([, p]) => methodsOf(p).some((key) => /\bnull,18\)\}$/.test(text(own2(p, key)))));
  const hasMethodWith = (proto, marker) => methodsOf(proto).some((key) => text(own2(proto, key)).includes(marker));
  const bookClasses = prototypes.filter(([, p]) => hasMethodWith(p, "No sheet found with id %s") && hasMethodWith(p, "Sheet not found"));
  report.harness.modelClass = modelClasses.map(([name]) => name);
  report.harness.bookClass = bookClasses.map(([name]) => name);
  if (modelClasses.length !== 1 || bookClasses.length !== 1) {
    report.harness.error = "could not locate exactly one model class and one book class";
    return finish(2);
  }
  const [modelName, modelProto] = modelClasses[0];
  const book = Object.create(bookClasses[0][1]);
  const anything = new Proxy(function() {}, { get: () => anything, apply: () => book });
  const model = new Proxy(Object.create(modelProto), { get: (target, key, receiver) => (key in target) ? Reflect.get(target, key, receiver) : anything });
  const lookupNames = new Set;
  for (const name of functions) {
    const found = text(own2(g, name)).match(/^function [\w$]+\(\)\{return ([\w$]+)\("ritzmain"\)\}$/);
    if (found)
      lookupNames.add(found[1]);
  }
  report.harness.lookup = [...lookupNames];
  const modelMethods = new Set;
  for (const [, proto] of prototypes)
    for (const key of methodsOf(proto))
      if (new RegExp(`new ${modelName.replace(/\$/g, "\\$&")}\\(`).test(text(own2(proto, key))))
        modelMethods.add(key);
  report.harness.moduleMethodsReturningModel = [...modelMethods];
  const moduleStub = new Proxy({}, { get: (_, key) => () => modelMethods.has(key) ? model : {} });
  for (const name of lookupNames) {
    const original = own2(g, name);
    g[name] = (...args) => args[0] === "ritzmain" ? moduleStub : Reflect.apply(original, g, args);
  }
  const host = new Proxy({}, { getOwnPropertyDescriptor: () => ({ value: new Map, configurable: true, enumerable: true, writable: true }) });
  const shells = functions.filter((name) => text(own2(g, name)).includes('"fept"'));
  report.harness.shellClasses = shells;
  const app = {};
  shells.forEach((name, index) => {
    app[`shell${index}`] = new Proxy({}, {
      get: (_, key) => key === "constructor" ? own2(g, name) : undefined,
      getOwnPropertyDescriptor: (_, key) => key === "constructor" ? undefined : { value: host, configurable: true, enumerable: true, writable: true }
    });
  });
  g.waffle_api = { getInstanceOfApp: () => app };
  const trace = (step, detail) => report.steps.push({ step, detail });
  let build = null;
  try {
    build = await discoverNativeBuild(g, trace);
  } catch (error) {
    report.harness.discoveryThrew = String(error?.stack ?? error);
  }
  const roles = {};
  if (build) {
    for (const [role, name] of Object.entries(build.globals))
      roles[`global:${role}`] = name;
    for (const [role, name] of Object.entries(build.methods))
      roles[`method:${role}`] = name;
    for (const [field, value] of Object.entries(build.fields))
      roles[`field:${field}`] = value ?? null;
    report.discovered = true;
    report.result = {
      id: build.id,
      roles,
      registration: build.registration ? { appShell: build.registration.appShell, args: build.registration.args.length } : null,
      missingOptionalRoles: ["T5h", "Abg", "Rl", "QC", "Usd", "wtc"].filter((role) => !build.globals[role]),
      missingReaderFields: ["storage", "storageReady", "cell", "sheetNamePath"].filter((field) => !build.fields[field])
    };
  } else if (!report.steps.some((entry) => entry.step === "candidate")) {
    report.failure = "no model getter candidate was evaluated (see steps: providers / getterCandidates)";
  } else {
    report.failure = "every model getter candidate was rejected (see steps: candidate.rejected)";
  }
  return finish(report.discovered ? 0 : 1);
}

// tools/native-build/offline-relations.mjs
import { readFileSync as readFileSync2 } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";
import vm2 from "node:vm";
// userscript/src/native/reference/relations.json
var relations_default = {
  build: "ggV6s0daVJw",
  provenance: "research/archive/native-build-ggV6-2026-09-22/ritzmain.js, core.js, live-symbols.json; recorded=true means the SHA equals a live-verified fingerprint",
  roles: {
    cell: {
      owner: "grid",
      source: 'function(a,c){Ep()&&hj(a>=0,"row position cannot be negative (got: %s)",a);return Qt(this).w_(a,c)}',
      sha: "73afdfb75542254fc42b59fcdfa4896404f6efd5a393948e33f4580e3ea31e8e",
      recorded: true
    },
    chunkRead: {
      owner: "chunk",
      source: "function(a,c){aYf(this,a,c);return pTf(this.oa,a,c)}",
      sha: "fd8efa9b195db4f091e954167f85e464bb003a286ca6ba585d33f15b4b40d3f6",
      recorded: true
    },
    chunkQuery: {
      owner: "chunk",
      source: "function(a,c,e){e=QXf(e);(c&1)>0&&(e.ma=1,iMf(this.Ea.ma,a,e));(c&2)>0&&(e.ma=2,iMf(this.Ca.ma,a,e));(c&4)>0&&(e.ma=4,iMf(this.Ra.ma,a,e));(c&8)>0&&(e.ma=8,iMf(this.Ya.ma,a,e))}",
      sha: "b0d3a939634421672a727931c8ff15fee6acbc6c5d20d17bb4c2dc89d1a23084",
      recorded: false
    },
    staticRefs: {
      owner: "cell",
      source: "function(){var a=fJf(this);return a?yQf(a):null}",
      sha: "ad16477df7a9bdc038dcb681782d89cb1205487e3fda48bb77ea12697619c443",
      recorded: true
    },
    dynamicEdges: {
      owner: "cell",
      source: "function(){var a;return(a=this.ma.Hb.Wc(this.qa,this.oa))?nTf(a):null}",
      sha: "633aa25c58156e24c4913139b5cdebdfb6dc6c9d8deb8605e68be70ca97256e6",
      recorded: true
    },
    indexQuery: {
      owner: "index",
      source: "function(a,c,e,f,g,h){var k;(k=this.ma.get(a))&&k.pKa(a,c,e,f,g,h)}",
      sha: "87a706158a7617d803f3f1c596828fc57936e69d42a0b76d021d9bea35fb2ab3",
      recorded: true
    },
    treeQuery: {
      owner: "tree",
      source: "function(a,c,e,f,g,h){$Ef(this,c,e,f,g,this.ma,h)}",
      sha: "c6ad3739e8efb86ae6ec92b2f9045c731457dc30d1f672e3354f064a5f6623c1",
      recorded: true
    },
    supporting: {
      owner: "relation",
      source: "function(){return SL(this.ma)}",
      sha: "85fb57f7369a155015bdb06a166e38806acd8d372889004c5e1fe72b3c48d796",
      recorded: true
    },
    supported: {
      owner: "relation",
      source: "function(){return SL(this.oa)}",
      sha: "8b8e4b0700ffd5e1af116714a5e23e813562e5260ed0dbcdc74a958dfeade14f",
      recorded: true
    },
    leafEach: {
      owner: "container",
      source: "function(a){if(this.ma)for(let c=0;c<this.ma.length;c=c+1|0){let e=this.ma[c];a(e.ma,e.oa)}else jj(this.oa).forEach(a)}",
      sha: "952cc26154b37112d1a2e2cc06ec35b8268666baf07b49e060a9ef303dac199a",
      recorded: false
    },
    sheetMapEach: {
      owner: "sheetMap",
      source: "function(a){var c=this.ma,e;for(e in c)a(e,c[e])}",
      sha: "c9b694627d981d05aafb229bc52f224dab6136295f8fc0c1f76ef60f1989141b",
      recorded: false
    },
    es: {
      owner: "global",
      source: "function es(a,c,e,f,g){ds();return ns(a,c,e,f,g)}",
      sha: "8985af33a468315bb8785f23c76d818748c7467ddeea35103e3331a1ab235da2",
      recorded: false
    },
    ns: {
      owner: "global",
      source: `function ns(a,c,e,f,g){P_a();var h=new N_a;Ep()&&(Qp(c==-2147483647||c>=0,"startRow invalid  (%s)",c),Qp(e==-2147483647||e>=0,"startCol invalid  (%s)",e),WRa(f==-2147483647||f>=c,"bad row indices [%s,%s)",c,f),WRa(g==-2147483647||g>=e,"bad col indices [%s,%s)",e,g));f<c&&f!=-2147483647&&nj(O_a,(oj(),pj),"bad row indices ["+c+","+f+")",Jka());g<e&&g!=-2147483647&&nj(O_a,(oj(),pj),"bad col indices ["+e+","+g+")",Jka());if((c|0)!=c||(f|0)!=f||(e|0)!=e||(g|0)!=g)throw Bf(dj("Non-integer indices: [%s, %s, %s, %s]",
[oh(c),oh(e),oh(f),oh(g)])).Ga;a=Sp(a,"sheetId");h.wa=a;h.qa=c;h.va=e;h.ma=f;h.oa=g;return h}`,
      sha: "8934fcf44c611e501780d36ee5853178b8d946808b139a4f16a99602c299e7e3",
      recorded: false
    },
    R0a: {
      owner: "global",
      source: `function R0a(a,c,e,f){if(a.oa!=null||a.Rb())return null;var g=S0a(a)?P0a(a.ma.ma,a.wa,e):-2147483647,h=T0a(a)?P0a(a.ma.qa,a.va,f):-2147483647;e=U0a(a)?P0a(a.ma.oa,a.xa,e):-2147483647;var k=a.qa!=-2147483647?P0a(a.ma.va,a.qa,f):-2147483647;f=a.ma;if(S0a(a)&&e<=g&&e!=-2147483647){f=t_a(f,0);var p=g;g=e-1|0;e=p+1|0}T0a(a)&&k<=h&&k!=-2147483647&&(f=t_a(f,1),p=h,h=k-1|0,k=p+1|0);if(g<0&&g!=-2147483647||e<=0&&e!=-2147483647||h<0&&h!=-2147483647||k<=0&&k!=-2147483647)return null;c=f.wa?a.za:c;if(c==null)return null;
c=Tp(c);a=es(c,S0a(a)?g:-2147483647,T0a(a)?h:-2147483647,U0a(a)?e:-2147483647,a.qa!=-2147483647?k:-2147483647);g=new J0a;h=f;g.ma=a;g.oa=h;return g}`,
      sha: "4d94a2af82f09672f6b977a5b6dfc798e311d35afe18b8534f0ae744ddbbd7e3",
      recorded: true
    },
    p2e: {
      owner: "global",
      source: "function p2e(a,c,e,f){return(a=R0a(a.ma,c,e,f))?a.ma:null}",
      sha: "06c4daf9eeb87644d93979a640d2a71ed72dc292f1953688ebd8194314b4bb76",
      recorded: true
    },
    t2e: {
      owner: "global",
      source: "function t2e(){this.oa=0}",
      sha: "f435646363612d68b8f06db3704e4f4560ce2e12bba13a6c35b42b7d2e61d900",
      recorded: true
    },
    fJf: {
      owner: "global",
      source: "function fJf(a){return a.ma.oa.Wc(a.qa,a.oa)}",
      sha: "3febcf147ccd7247ca0d42f17becb7e576ffecadbc24f8633db02e7b0a9aa938",
      recorded: true
    },
    yQf: {
      owner: "global",
      source: "function yQf(a){if(S8e(a.ma)&&S8e(a.oa))return a.qa?xQf(a.qa):null;var c=bk();a.qa&&LF(c,xQf(a.qa));a.ma&&a.ma.forEach(function(e,f){fk(c,f)});a.oa&&a.oa.forEach(function(e,f){fk(c,f)});return qxe(hk(c),dg())}",
      sha: "ad9a908f55721666e331468411b742071f01c1bac09330cce17caad0baed5223",
      recorded: true
    },
    xQf: {
      owner: "global",
      source: "function xQf(a){a.va||a.va||(a.va=wQf(a));return a.va}",
      sha: "1006d21ed04bac3b095838fe5559cb8aaff98a9ec1ac75993e3d291792e42e57",
      recorded: true
    },
    wQf: {
      owner: "global",
      source: "function wQf(a){var c=oxe(a.ma.Cb());LPf(a,new HPf(function(e,f){a.K1c(f.ma)&&fk(c,n4e(e,f))}));return qxe(hk(c),eg(function(e,f){return h2e(e,f)}))}",
      sha: "dda63fdf66a103dee6479e0655b7f7ba6c38b1dc6c19c096e44e05c6ac0755f5",
      recorded: true
    },
    nTf: {
      owner: "global",
      source: "function nTf(a){a.qa||a.qa||(a.qa=mTf(a));return a.qa}",
      sha: "b4c9f6713dc7158df3b4a0d7b83dac53a590f5919cd1711b653656291c7669a3",
      recorded: true
    },
    mTf: {
      owner: "global",
      source: "function mTf(a){var c=bk();LPf(a,new HPf(function(e,f){if(D2e(f)){var g=k0e(f.ma);let k=new l0e;var h=k;f=f.wa;h.ma=e;h.oa=g;h.qa=f;fk(c,k)}}));return hk(c)}",
      sha: "daab7ea661d34f680a62fd9aef6d48ef540481585135dbbecf0219962c71ac1b",
      recorded: true
    },
    LPf: {
      owner: "global",
      source: "function LPf(a,c){a.ma.Sm(function(e){var f=e.Ew();if(!e.I1c()){var g=e.By();e=e.Kr();for(let k=0;k<f.length;k=k+1|0){var h=f[k];let p=h.oa;h=X2e(h,g,e);for(let q=0;q<p.length;q=q+1|0){let r=c.ma;r(h,p[q])}}}})}",
      sha: "7966a69cde022f14575d390723e3882d9287e25a23255cef323a0985fa356f1f",
      recorded: true
    },
    q1e: {
      owner: "global",
      source: 'function q1e(a){switch(a){case 0:return"FROM_ARRAY_VALUE_TO_ARRAY_EXPRESSION";case 1:return"FROM_ARRAY_EXPR_TO_RESULT_RANGE";case 2:return"FROM_FORMULA_TO_GRID_STRUCTURE";case 3:return"FROM_CONDITIONAL_FORMAT_TO_GRID_STRUCTURE";case 4:return"FROM_DATA_VALIDATION_TO_GRID_STRUCTURE";case 5:return"FROM_FORMULA_TO_RANGE";case 6:return"FROM_CONDITIONAL_FORMAT_TO_RANGE";case 7:return"FROM_DATA_VALIDATION_TO_RANGE";default:throw zf("vi`"+N(a)).Ga;}}',
      sha: "4a21ae53a8d93046a343e361678856d34ef5cc4c6fb38723e5ff338ecc22880c",
      recorded: true
    },
    pTf: {
      owner: "global",
      source: "function pTf(a,c,e){var f=a.Vc[0],g=new oTf;g.qa=c;g.oa=e;g.va=f;g.ma=a;return g}",
      sha: "b0f4b7865e7b932a6705b961dac3d431064dd08a1eb3979651bd6809070b338a",
      recorded: true
    },
    aYf: {
      owner: "global",
      source: 'function aYf(a,c,e){$Xf(c,e);if(Ep()){if(c>=a.qa)throw Bf("Zp`"+c+"`"+a.qa+"`"+N(a.ma)).Ga;if(e>=a.va)throw Bf("$p`"+e+"`"+a.va+"`"+N(a.ma)).Ga;}}',
      sha: "7c548100c193c785bf5987528010e965cc936bb6a8c542c261642e71b883d3ed",
      recorded: true
    },
    $Ef: {
      owner: "global",
      source: "function $Ef(a,c,e,f,g,h,k){if(!h.ma)return!0;var p=h.ma;if(Yef(c,f,p.oa,p.va)&&Yef(e,g,p.ma,p.qa)){if(h.qa)return k.oa(TEf(h));h=h.oa;for(let q=0,r=h.length;q<r;q=q+1|0)if(!$Ef(a,c,e,f,g,h[q],k))return!1}return!0}",
      sha: "cd784bf419ed0aee71ed01401760a505c55ce193d1bcb3d26303f3b72a451a8a",
      recorded: true
    },
    TEf: {
      owner: "global",
      source: "function TEf(a){return Tp(a.qa)}",
      sha: "fa185e0569cbc86ae3efcdcd0144e4e96e539ed6fd86f4783966dbe79b6dbcde",
      recorded: true
    },
    Yef: {
      owner: "global",
      source: "function Yef(a,c,e,f){return(f==-2147483647||a==-2147483647||a<f)&&(c==-2147483647||e==-2147483647||c>e)}",
      sha: "fc9e1b64b723199c7fde4c7925ddd4c61d90b27d7b13c46a536e57c28f51df96",
      recorded: true
    },
    iMf: {
      owner: "global",
      source: "function iMf(a,c,e){a.ma.pKa(c.Ta(),c.qa,c.va,c.ma,c.oa,WLf(e))}",
      sha: "d9d148e0c26b1e54f4039e8af47ddd7ca91bc22706c932a23b0e0c3aa77509be",
      recorded: false
    },
    SL: {
      owner: "global",
      source: 'function SL(a){return Sp(a.ma,"This GridRangeReference is no longer part of a RangeMap, which means that row and column indices are no longer being tracked.")}',
      sha: "1efb73296749230dc121ba596d4b04b0294cb8f8bd488184ea4b5324187070e1",
      recorded: false
    },
    Qt: {
      owner: "global",
      source: 'function Qt(a){ij(a.oa.Bj(),"Chunk %s is not loaded",a.ma);return a.oa}',
      sha: "3cd291a38d7da0d85178118189ec0c7331b0cea70f77ac51fa093f2cede5f0b7",
      recorded: false
    }
  },
  variants: {
    wrapped: {
      build: "Mm_qTNRMLew",
      provenance: "research/archive/native-build-2026-10-06-Mm_qTNRMLew/core.js (95431ea789d2b58d2c7501d1d34d6b01f2180344e1832a47c1e72a9216b36356) and ritzmain.js (f2e45c6f1e54168219f0c2dae37bb56e60f9b8c16a0b4b6046f4617962ae9f8f); archive only, static references wrapped in a {ea: list} holder; native-build-2026-10-06 (5caBzNSDBaQ) aligns with the same bodies",
      roles: {
        yQf: {
          owner: "global",
          source: "function OUf(a){if(G$e(a.ea)&&G$e(a.ma))return a.oa?NUf(a.oa).ea:null;var c=ck();a.oa&&sF(c,NUf(a.oa).ea);a.ea&&a.ea.forEach(function(e,f){gk(c,f)});a.ma&&a.ma.forEach(function(e,f){gk(c,f)});return Wye(kk(c),Xf())}",
          sha: "8aab761766f67b50abec79696a6e94e08a7e205dd037b1444842533366803faa",
          recorded: false
        },
        xQf: {
          owner: "global",
          source: "function NUf(a){var c=a.oa;c||(c=a.oa,c||(c=Yp(v4e(MUf(a))),a.oa=c));return c}",
          sha: "3f017e780e3cc4b274010de142e652f8dd11de329ff1d6d26c3d8c8bfacf962f",
          recorded: false
        },
        v4e: {
          owner: "global",
          source: "function v4e(a){u4e();if(a)if(Uj(a))a=p4e;else{let c=new s4e;c.ea=a;a=c}else a=null;return a}",
          sha: "387c00a3e928b3c05b115ecef3d35dfbee1c9a9a227efcec017867650be59e64",
          recorded: false
        },
        Yp: {
          owner: "global",
          source: "function Yp(a){return Xp(a,null)}",
          sha: "d8b6abbad8326a07b95337122c76763976840edc2e1ded8eab9b7880e4305c09",
          recorded: false
        }
      }
    },
    ordered: {
      build: "Mm_qTNRMLew",
      provenance: "research/archive/native-build-2026-10-06-Mm_qTNRMLew/core.js (95431ea789d2b58d2c7501d1d34d6b01f2180344e1832a47c1e72a9216b36356) and ritzmain.js (f2e45c6f1e54168219f0c2dae37bb56e60f9b8c16a0b4b6046f4617962ae9f8f); archive only, range constructor that swaps inverted indices before ns; native-build-2026-10-06 (5caBzNSDBaQ) aligns with the same bodies",
      roles: {
        es: {
          owner: "global",
          source: 'function ks(a,c,e,f,g){js();if(c!=-2147483647&&f!=-2147483647&&c>f){qj(oZa,(sj(),tj),"Inverted row range: bad row indices ["+c+","+f+")",Hka());var h=c;c=f;f=h}e!=-2147483647&&g!=-2147483647&&e>g&&(qj(oZa,(sj(),tj),"Inverted col range:bad col indices ["+e+","+g+")",Hka()),h=e,e=g,g=h);return ss(a,c,e,f,g)}',
          sha: "315c8b0d418b2b0828bd93745ce25731b52afdaf97c13260d88cf67f776a287f",
          recorded: false
        }
      }
    }
  }
};

// userscript/src/native/relation-bindings.js
var roles = relations_default.roles;
var sources = (role) => [
  { variant: null, source: roles[role]?.source },
  ...Object.entries(relations_default.variants ?? {}).map(([variant, value]) => ({ variant, source: value.roles[role]?.source }))
].filter((entry) => entry.source);
var matches = (role, text) => sources(role).some((entry) => align(entry.source, text));
var own2 = (value, key) => Object.getOwnPropertyDescriptor(value ?? {}, key)?.value;
var calls = {
  cell: { Qt: "@Qt(this)" },
  chunkRead: { aYf: "@aYf(this", pTf: "@pTf(this" },
  staticRefs: { fJf: "@fJf(this)", yQf: "@yQf(a)" },
  yQf: { xQf: "@xQf(a.qa)" },
  xQf: { wQf: "=@wQf(a)" },
  "yQf:wrapped": { xQf: "@NUf(a.oa).ea" },
  "xQf:wrapped": { wQf: "v4e(@MUf(a))", v4e: "Yp(@v4e(", Yp: "c=@Yp(v4e" },
  "es:ordered": { ns: "return@ss(a,c,e,f,g)" },
  wQf: { LPf: "@LPf(a," },
  dynamicEdges: { nTf: "@nTf(a)" },
  nTf: { mTf: "=@mTf(a)" },
  mTf: { LPf: "@LPf(a," },
  p2e: { R0a: "@R0a(a.ma" },
  R0a: { es: "=@es(c" },
  es: { ns: "@ns(a" },
  treeQuery: { $Ef: "@$Ef(this" },
  $Ef: { Yef: "@Yef(c,f", TEf: "@TEf(h)" },
  supported: { SL: "@SL(this" },
  supporting: { SL: "@SL(this" }
};
var relationCalls = calls;
var checks = {
  "yQf:wrapped": (view, global) => view.at("?NUf(a.oa).@ea:null") === global("v4e").at("c.@ea=a")
};
var searched = { p2e: { arity: 4 }, q1e: { arity: 1, marker: '"FROM_FORMULA_TO_RANGE"' }, LPf: { arity: 2 } };
function createRelationBindings(g) {
  const globals = new Map, methods = new WeakMap;
  const changed = (role) => Error(t("Google изменил источник связей ({role}). Нужна проверка совместимости.", { role }));
  function verified(role, fn) {
    const live = typeof fn === "function" ? source(fn) : "";
    const found = sources(role).map((entry) => ({ variant: entry.variant, view: align(entry.source, live) })).filter((entry) => entry.view);
    if (found.length !== 1)
      throw changed(role);
    return Object.assign(found[0].view, { fn, role, variant: found[0].variant });
  }
  function withCallees(view) {
    const key = view.variant ? `${view.role}:${view.variant}` : view.role;
    for (const [role, snippet] of Object.entries(calls[key] ?? {}))
      global(role, view.at(snippet));
    if (checks[key] && !checks[key](view, global))
      throw changed(view.role);
    return view;
  }
  function global(role, name) {
    const cached2 = globals.get(role);
    if (cached2) {
      if (name !== undefined && cached2.name !== name)
        throw changed(role);
      return cached2;
    }
    if (name === undefined)
      throw changed(role);
    const view = Object.assign(verified(role, own2(g, name)), { name });
    globals.set(role, view);
    return withCallees(view);
  }
  function pick(candidates2, resolve2, label) {
    const saved = new Map(globals), winners = [];
    for (const candidate of candidates2) {
      try {
        winners.push({ view: resolve2(candidate), cache: new Map(globals) });
      } catch {}
      globals.clear();
      for (const [key, value] of saved)
        globals.set(key, value);
    }
    if (winners.length !== 1)
      throw Error(t("{label} не найден однозначно.", { label }));
    for (const [key, value] of winners[0].cache)
      globals.set(key, value);
    return winners[0].view;
  }
  function search(role) {
    if (globals.has(role))
      return globals.get(role);
    const { arity, marker } = searched[role], length = roles[role].source.length, names = [];
    for (const name of Object.getOwnPropertyNames(g)) {
      const fn = own2(g, name);
      if (typeof fn !== "function" || fn.length !== arity)
        continue;
      const text = source(fn);
      if (text.length > length / 2 && text.length < length * 2 && (!marker || text.includes(marker)) && align(roles[role].source, text))
        names.push(name);
    }
    return pick(names, (name) => global(role, name), t("Функция связей ({role})", { role }));
  }
  function candidates(object, role) {
    const found = new Map;
    for (let level = object && Object.getPrototypeOf(object);level && level !== Object.prototype; level = Object.getPrototypeOf(level))
      for (const name of Object.getOwnPropertyNames(level)) {
        const fn = own2(level, name);
        if (name !== "constructor" && !found.has(name) && typeof fn === "function" && matches(role, source(fn)))
          found.set(name, Object.assign(verified(role, fn), { name }));
      }
    return [...found.values()];
  }
  function cached(object, key, resolve2) {
    const prototype = object && Object.getPrototypeOf(object);
    if (!prototype)
      throw Error(t("Объект связей недоступен ({key}).", { key }));
    if (!methods.has(prototype))
      methods.set(prototype, new Map);
    const cache = methods.get(prototype);
    if (!cache.has(key))
      cache.set(key, resolve2());
    return cache.get(key);
  }
  function method(object, role) {
    return cached(object, role, () => pick(candidates(object, role), withCallees, t("Метод связей ({role})", { role })));
  }
  function named(object, name, role) {
    return cached(object, `${role}:${name}`, () => withCallees(Object.assign(verified(role, object?.[name]), { name })));
  }
  function fieldHolding(object, role) {
    const keys = Object.keys(object ?? {}).filter((key) => {
      const value = own2(object, key);
      try {
        return !!value && typeof value === "object" && !!method(value, role);
      } catch {
        return false;
      }
    });
    if (keys.length !== 1)
      throw Error(t("Поле связей ({role}) не найдено однозначно.", { role }));
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
    const holder = own2(index, query.at("this.@ma.get(a)"));
    const sheetMap = own2(holder, method(holder, "sheetMapEach").at("var c=this.@ma"));
    if (!sheetMap || Object.getPrototypeOf(sheetMap) !== null)
      throw Error(t("Обратный индекс недоступен."));
    const tree = own2(sheetMap, sheetId);
    if (!tree)
      return null;
    const treeQuery = named(tree, query.at("k.@pKa(a,c"), "treeQuery"), walk = global("$Ef");
    return {
      root: own2(tree, treeQuery.at(",this.@ma,h)")),
      node: { rect: walk.at("var p=h.@ma"), leaf: walk.at("if(h.@qa)"), children: walk.at("h=h.@oa;") },
      rect: { rowStart: walk.at("p.@oa,p.va"), rowEnd: walk.at("p.oa,p.@va"), colStart: walk.at("e,g,p.@ma"), colEnd: walk.at("p.ma,p.@qa") }
    };
  }
  function leafPairs(leaf) {
    const container = own2(leaf, fieldHolding(leaf, "leafEach"));
    const each = method(container, "leafEach");
    const pairs = own2(container, each.at("if(this.@ma)"));
    return Array.isArray(pairs) ? { pairs, key: each.at("a(e.@ma,e.oa)"), relation: each.at("a(e.ma,e.@oa)") } : null;
  }
  function relationRefs(relation) {
    const lpf = search("LPf");
    const supporting = named(relation, lpf.at("var g=e.@By()"), "supporting");
    const supported = named(relation, lpf.at("e=e.@Kr()"), "supported");
    return { supported: supported.at("SL(this.@oa)"), supporting: supporting.at("SL(this.@ma)"), range: global("SL").at("Sp(a.@ma") };
  }
  function direction(tree) {
    let node = tree.root;
    for (let depth = 0;node && !own2(node, tree.node.leaf) && depth < 64; depth++)
      node = own2(node, tree.node.children)?.[0];
    const found = node && leafPairs(own2(node, tree.node.leaf));
    const pair = found?.pairs[0], relation = own2(pair, found?.relation);
    if (!relation)
      return null;
    const refs = relationRefs(relation), key = own2(pair, found.key);
    return key === own2(relation, refs.supported) ? "primary" : key === own2(relation, refs.supporting) ? "secondary" : null;
  }
  function gridFields(grid) {
    const cell = method(grid, "cell"), qt = global("Qt"), chunkField = qt.at("a.@oa.Bj()");
    const chunk = own2(grid, chunkField);
    if (!chunk)
      return null;
    method(chunk, "chunkRead");
    const bounds = global("aYf");
    return {
      chunk,
      chunkField,
      cellMethod: cell.name,
      ready: qt.at("a.oa.@Bj()"),
      rows: bounds.at("c>=a.@qa"),
      columns: bounds.at("e>=a.@va")
    };
  }
  return {
    gridFields,
    gridSize(grid) {
      const fields = gridFields(grid);
      return fields && { rows: own2(fields.chunk, fields.rows), columns: own2(fields.chunk, fields.columns) };
    },
    cellReader(grid) {
      const fields = gridFields(grid), chunk = fields?.chunk;
      if (!chunk || typeof chunk[fields.ready] !== "function" || !chunk[fields.ready]())
        return null;
      return { chunk, cellMethod: fields.cellMethod, rows: own2(chunk, fields.rows), columns: own2(chunk, fields.columns) };
    },
    forward(cell) {
      const staticRefs = method(cell, "staticRefs"), dynamicEdges = method(cell, "dynamicEdges");
      const p2e = search("p2e"), r0a = global("R0a"), q1e = search("q1e"), edge = global("mTf");
      return {
        staticRefs: () => cell[staticRefs.name](),
        dynamicEdges: () => cell[dynamicEdges.name](),
        isStaticRef: (ref) => !!ref?.constructor && !!align(roles.t2e.source, source(ref.constructor)),
        staticRange: (ref, sheetId, row, col) => p2e.fn(ref, sheetId, row, col),
        dynamicRange: (relative, sheetId, row, col) => own2(r0a.fn(relative, sheetId, row, col), r0a.at("g.@ma=a")),
        edgeType: (value) => own2(value, edge.at("h.@oa=g")),
        edgeRelative: (value) => own2(value, edge.at("h.@ma=e")),
        typeName: (type) => q1e.fn(type),
        range: rangeFields(),
        members: { staticRefs: staticRefs.name, dynamicEdges: dynamicEdges.name }
      };
    },
    reverse(chunk, sheetId) {
      const trees = [];
      for (const query of candidates(chunk, "chunkQuery")) {
        const iMf = verified("iMf", own2(g, query.at("@iMf(this.Ea")));
        const index = own2(own2(own2(chunk, query.at("this.@Ea.ma")), query.at("this.Ea.@ma")), iMf.at("a.@ma.pKa"));
        const tree = index && indexTree(index, named(index, iMf.at("a.ma.@pKa"), "indexQuery"), sheetId);
        if (tree)
          trees.push(tree);
      }
      if (!trees.length)
        return null;
      const primary = trees.filter((tree) => direction(tree) === "primary");
      if (primary.length !== 1)
        throw Error(t("Направление обратного индекса не подтверждено."));
      return {
        ...primary[0],
        range: rangeFields(),
        pairs: leafPairs,
        supportedRange(relation) {
          const refs = relationRefs(relation);
          return own2(own2(relation, refs.supported), refs.range);
        }
      };
    }
  };
}

// tools/native-build/offline-relations.mjs
var dummy = () => new Proxy(function() {}, {
  get: (_, key) => key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : key === "length" ? 0 : key === "lang" ? "ru" : dummy(),
  apply: () => dummy(),
  construct: () => dummy(),
  set: () => true,
  has: () => true
});
function load(dir) {
  const g = vm2.createContext({});
  vm2.runInContext("var window=this,self=this;", g);
  Object.assign(g, {
    DOCS_timing: {},
    config: { mssServingEnabled: true },
    document: dummy(),
    navigator: dummy(),
    location: new URL("https://docs.google.com/spreadsheets/d/synthetic/edit"),
    setTimeout,
    console
  });
  for (const file of ["core.js", "ritzmain.js"]) {
    try {
      vm2.runInContext(readFileSync2(join2(dir, file), "utf8"), g, { filename: file });
    } catch (error) {
      if (file !== "ritzmain.js")
        throw error;
    }
  }
  return g;
}
var own3 = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
var sourcesOf = (role) => [relations_default.roles[role]?.source, ...Object.values(relations_default.variants ?? {}).map((variant) => variant.roles[role]?.source)].filter(Boolean);
var matching2 = (role, text) => sourcesOf(role).some((ref) => align(ref, text));
var sourceEntries = (role) => [
  { variant: null, source: relations_default.roles[role]?.source },
  ...Object.entries(relations_default.variants ?? {}).map(([variant, value]) => ({ variant, source: value.roles[role]?.source }))
].filter((entry) => entry.source);
function relationsOffline(dir) {
  let failed = false;
  const g = load(resolve2(dir));
  const globalFns = Object.getOwnPropertyNames(g).filter((name) => typeof own3(g, name) === "function");
  const prototypes = globalFns.map((name) => [name, own3(own3(g, name), "prototype")]).filter(([, proto]) => proto && typeof proto === "object");
  const methodsOf = (proto) => Object.getOwnPropertyNames(proto).filter((key) => key !== "constructor" && typeof own3(proto, key) === "function");
  const roles2 = {}, unresolved = [];
  const variantRoles = new Set(Object.values(relations_default.variants ?? {}).flatMap((variant) => Object.keys(variant.roles)));
  for (const [role, value] of Object.entries(relations_default.roles)) {
    const found = new Set;
    if (value.owner === "global") {
      for (const name of globalFns)
        if (matching2(role, source(own3(g, name))))
          found.add(name);
    } else
      for (const [, proto] of prototypes)
        for (const key of methodsOf(proto))
          if (matching2(role, source(own3(proto, key))))
            found.add(key);
    if (found.size)
      roles2[role] = [...found];
    else
      unresolved.push(role);
  }
  const variantOnly = {};
  for (const role of variantRoles)
    if (!(role in relations_default.roles))
      variantOnly[role] = globalFns.filter((name) => matching2(role, source(own3(g, name)))).length;
  const report = {
    build: dir,
    rolesAligned: Object.keys(roles2).length,
    rolesTotal: Object.keys(relations_default.roles).length,
    unresolved,
    variantOnlyAlignedFunctions: variantOnly,
    real: {}
  };
  const entries = (role, owner) => (owner === "global" ? globalFns.map((name) => [name, own3(g, name)]) : prototypes.flatMap(([, proto]) => methodsOf(proto).map((key) => [key, own3(proto, key)]))).flatMap(([name, fn]) => sourceEntries(role).map((entry) => ({ name, entry, view: align(entry.source, source(fn)) })).filter((found) => found.view));
  report.graph = {};
  for (const [role, value] of Object.entries(relations_default.roles)) {
    const candidates = entries(role, value.owner);
    const resolving = candidates.filter(({ entry, view }) => Object.entries(relationCalls[entry.variant ? `${role}:${entry.variant}` : role] ?? {}).every(([callee, snippet]) => {
      try {
        const live = own3(g, view.at(snippet));
        return typeof live === "function" && matching2(callee, source(live));
      } catch {
        return false;
      }
    }));
    const hasCalls = candidates.some(({ entry }) => relationCalls[entry.variant ? `${role}:${entry.variant}` : role]);
    if (hasCalls || resolving.length !== candidates.length)
      report.graph[role] = {
        candidates: candidates.length,
        resolving: resolving.length,
        via: [...new Set(resolving.map(({ entry }) => entry.variant ?? "base"))]
      };
    if (hasCalls && resolving.length < 1 && sourcesOf(role).length && candidates.length) {
      report.graphFailed = [...report.graphFailed ?? [], role];
      failed = true;
    }
    if (hasCalls && !candidates.length && value.owner !== "global" || hasCalls && candidates.length && !resolving.length) {
      report.graphFailed = [...new Set([...report.graphFailed ?? [], role])];
      failed = true;
    }
  }
  const links = [["LPf", "var g=e.@By()", "supporting"], ["LPf", "e=e.@Kr()", "supported"], ["iMf", "a.ma.@pKa", "indexQuery"], ["chunkQuery", "k.@pKa(a,c", "treeQuery"]];
  report.links = {};
  for (const [from, snippet, target] of links) {
    const owners = entries(from, from === "chunkQuery" ? "method" : "global");
    const holder = from === "chunkQuery" ? entries("indexQuery", "method") : owners;
    const names = new Set(holder.map(({ view }) => {
      try {
        return view.at(snippet);
      } catch {
        return null;
      }
    }).filter(Boolean));
    const ok = [...names].filter((name) => prototypes.some(([, proto]) => typeof own3(proto, name) === "function" && matching2(target, source(own3(proto, name)))));
    report.links[`${from}->${target}`] = { names: names.size, aligned: ok.length };
    if (!ok.length) {
      report.linksFailed = [...report.linksFailed ?? [], `${from}->${target}`];
      failed = true;
    }
  }
  const bindings = createRelationBindings(g);
  const aligned = (proto, role) => methodsOf(proto).some((key) => align(relations_default.roles[role].source, source(own3(proto, key))));
  const cells = prototypes.filter(([, proto]) => aligned(proto, "staticRefs") && aligned(proto, "dynamicEdges"));
  report.real.cellClasses = cells.map(([name]) => name);
  try {
    if (cells.length !== 1)
      throw Error(`${cells.length} cell classes`);
    const forward = bindings.forward(Object.create(cells[0][1]));
    report.real.forward = { members: forward.members, range: forward.range };
    report.real.staticRefsBody = source(own3(cells[0][1], forward.members.staticRefs)).slice(0, 80);
  } catch (error) {
    report.real.forwardError = String(error.message);
    failed = true;
  }
  try {
    const grids = prototypes.filter(([, proto]) => aligned(proto, "cell")), chunks = prototypes.filter(([, proto]) => aligned(proto, "chunkRead"));
    if (grids.length !== 1 || chunks.length !== 1)
      throw Error(`${grids.length} grid / ${chunks.length} chunk classes`);
    const chunkTarget = Object.create(chunks[0][1]);
    const chunk = new Proxy(chunkTarget, {
      get: (target, key, receiver) => (key in target) ? Reflect.get(target, key, receiver) : () => true,
      getOwnPropertyDescriptor: () => ({ value: 100, configurable: true, enumerable: true, writable: true })
    });
    const grid = new Proxy(Object.create(grids[0][1]), { getOwnPropertyDescriptor: () => ({ value: chunk, configurable: true, enumerable: true, writable: true }) });
    const reader = bindings.cellReader(grid);
    report.real.reader = reader ? { cellMethod: reader.cellMethod, rows: reader.rows, columns: reader.columns } : null;
    if (!reader)
      throw Error("reader is null");
    const { chunkField, rows, columns } = bindings.gridFields(grid);
    report.real.gridFields = { chunk: chunkField, rows, columns };
    if (![chunkField, rows, columns].every((name) => typeof name === "string" && name))
      throw Error("grid fields unresolved");
  } catch (error) {
    report.real.readerError = String(error.message);
    failed = true;
  }
  if (unresolved.length)
    failed = true;
  return { failed, report };
}

// tools/watch/known-builds.mjs
var readKnownBuilds = () => [
  {
    build: "yAY-xL4PITs",
    capturedAt: "2026-09-25",
    hosts: [
      "/855087257-calcworkerhost_custom_descriptors_core_custom_descriptors.js"
    ]
  },
  {
    build: "wBgaH0qzTLs",
    capturedAt: "2026-09-29",
    hosts: [
      "/1040291595-calcworkerhost_custom_descriptors_core_custom_descriptors.js"
    ]
  },
  {
    build: "Mm_qTNRMLew",
    capturedAt: "2026-10-06",
    hosts: [
      "/412851073-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
      "/3494893496-calcworkerhost_core.js"
    ]
  },
  {
    build: "5caBzNSDBaQ",
    capturedAt: "2026-10-06",
    hosts: [
      "/412851073-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
      "/3494893496-calcworkerhost_core.js"
    ]
  },
  {
    build: "I4Jd94ijZgM",
    capturedAt: "2026-10-10",
    hosts: [
      "/1983723940-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
      "/3692391049-calcworkerhost_core.js"
    ]
  },
  {
    build: "UqjPSx5-9ws",
    capturedAt: "2026-10-13",
    hosts: [
      "/2579729974-calcworkerhost_custom_descriptors_core_custom_descriptors.js",
      "/281187165-calcworkerhost_core.js"
    ]
  }
];

// tools/watch/report.mjs
import { createHash as createHash2 } from "node:crypto";
var digestMarker = /<!-- google-watch digest: ([0-9a-f]{16}) -->/g;
var buildMarker = /<!-- google-watch build: (\S+) ([0-9a-f]{16}) -->/g;
var short = (hash2) => hash2 ? hash2.slice(0, 12) : "-";
var hash16 = (value) => createHash2("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
function summarizeRelations({ failed, report }) {
  const real = report.real ?? {};
  const problems = [
    ...(report.unresolved ?? []).map((role) => `role ${role} not aligned`),
    ...(report.graphFailed ?? []).map((role) => `call graph of ${role} not resolved`),
    ...(report.linksFailed ?? []).map((link) => `link ${link} not aligned`),
    ...real.forwardError ? [`forward chain: ${real.forwardError}`] : [],
    ...real.readerError && real.readerError !== "grid fields unresolved" ? [`chunk reader: ${real.readerError}`] : []
  ];
  if (failed && !problems.length && !(real.readerError === "grid fields unresolved"))
    problems.push("the harness reported a failure without a named cause");
  const fields = real.gridFields ?? {};
  const gridResolved = ["chunk", "rows", "columns"].every((key) => typeof fields[key] === "string" && fields[key]);
  return {
    relations: { status: problems.length ? "failed" : "ok", rolesAligned: report.rolesAligned ?? null, rolesTotal: report.rolesTotal ?? null, problems },
    gridFields: { status: gridResolved ? "ok" : "unresolved", chunk: fields.chunk ?? null, rows: fields.rows ?? null, columns: fields.columns ?? null }
  };
}
function summarizeDiscovery({ code, report }) {
  const status = code === 0 ? "ok" : code === 1 ? "failed" : "harness-error";
  return {
    status,
    id: report.result?.id ?? null,
    failure: report.failure ?? report.harness?.error ?? report.harness?.discoveryThrew?.split(`
`)[0] ?? null,
    missingOptionalRoles: report.result?.missingOptionalRoles ?? [],
    missingReaderFields: report.result?.missingReaderFields ?? []
  };
}
function knownIndex(builds = [], workerRows = []) {
  return {
    builds: new Map(builds.map((item) => [item.build, item.capturedAt ?? null])),
    hosts: new Set([...builds.flatMap((item) => item.hosts ?? []), ...workerRows.map((row) => row.host)])
  };
}
function assessBuild(build, known) {
  const attention = [], info = [];
  const host = build.coreHost;
  if (!host)
    attention.push({ code: "core-worker-missing", message: "the page offers no calcworkerhost_core Worker, so its canonical message path cannot be checked" });
  else {
    const { canonical, anchors, glue } = host;
    if (canonical.verdict !== "accepted")
      attention.push({ code: "canonical", message: `canonical message-path digest (CV6) of ${host.host} is ${canonical.verdict}` + (canonical.sha256 ? ` (${short(canonical.sha256)}, not in verifiedCanonical)` : "") + ": the Worker protocol may have changed" });
    else {
      if (glue.verdict !== "accepted")
        info.push({ code: "glue-changed", message: `glue digest of ${host.host} changed (${short(glue.sha256)}); canonical accepted` });
      if (anchors.verdict !== "accepted")
        info.push({ code: "anchors-changed", message: `anchors digest of ${host.host} is ${anchors.verdict}; canonical accepted` });
    }
    if (!known.hosts.has(host.host))
      info.push({ code: "new-host", message: `new Worker host name ${host.host}` });
  }
  if (build.discovery.status !== "ok")
    attention.push({ code: "discovery", message: `offline page discovery ${build.discovery.status}${build.discovery.failure ? `: ${build.discovery.failure}` : ""}` });
  else {
    const fields = build.discovery.missingReaderFields ?? [], roles2 = build.discovery.missingOptionalRoles ?? [];
    if (fields.length)
      attention.push({ code: "discovery-reader-fields", message: `offline page discovery found no reader field ${fields.join(", ")}: formula text or sheet names would read wrong` });
    if (roles2.length)
      info.push({ code: "discovery-optional-roles", message: `offline page discovery found no optional role ${roles2.join(", ")}` });
  }
  if (build.relations.status !== "ok")
    attention.push({ code: "relations", message: `offline «Связи» resolution failed: ${build.relations.problems.join("; ")}` });
  if (build.gridFields.status !== "ok")
    attention.push({ code: "grid-fields", message: "cell-capacity grid fields do not resolve " + `(chunk ${build.gridFields.chunk ?? "?"}, rows ${build.gridFields.rows ?? "?"}, columns ${build.gridFields.columns ?? "?"})` });
  if (!known.builds.has(build.build))
    info.push({ code: "new-build", message: `build ${build.build} is not in the archived manifests` });
  return { attention, info };
}
var factsOf = (build) => ({
  attention: build.attention.map((item) => item.code).sort(),
  canonical: build.coreHost ? [build.coreHost.host, build.coreHost.canonical.verdict, build.coreHost.canonical.sha256 ?? null] : null,
  discovery: [build.discovery.status, build.discovery.failure, build.discovery.missingReaderFields ?? []],
  relations: build.relations.problems,
  gridFields: [build.gridFields.chunk, build.gridFields.rows, build.gridFields.columns]
});
function issueFor(builds) {
  const flagged = builds.filter((build) => build.attention.length).sort((a, b) => a.build.localeCompare(b.build));
  if (!flagged.length)
    return null;
  return {
    title: `Google Sheets build ${flagged.map((build) => build.build).join(", ")} needs attention`,
    digest: hash16(flagged.map((build) => ({ build: build.build, ...factsOf(build) }))),
    builds: Object.fromEntries(flagged.map((build) => [build.build, hash16(factsOf(build))]))
  };
}
var postedBuilds = (issue) => {
  const latest = new Map;
  for (const text of [issue.body ?? "", ...(issue.comments ?? []).map((comment) => comment.body ?? "")])
    for (const match of text.matchAll(buildMarker))
      latest.set(decodeURIComponent(match[1]), match[2]);
  return latest;
};
var titledBuilds = (title) => title.match(/^Google Sheets build (.+) needs attention$/)?.[1].split(", ") ?? [];
function planIssue(report, issues) {
  if (!report.issue)
    return { action: "none", reason: "the report needs no attention" };
  const { title, digest } = report.issue;
  const current2 = Object.entries(report.issue.builds ?? {});
  const open = issues.filter((issue2) => (issue2.state ?? "OPEN").toUpperCase() === "OPEN").map((issue2) => ({ issue: issue2, posted: postedBuilds(issue2) })).sort((a, b) => (b.issue.number ?? 0) - (a.issue.number ?? 0));
  const related = ({ issue: issue2, posted: posted2 }) => current2.some(([build, facts2]) => posted2.has(build) || titledBuilds(issue2.title ?? "").includes(build) || [...posted2.values()].includes(facts2));
  const match = open.find(({ issue: issue2 }) => issue2.title === title) ?? open.find(related);
  if (!match)
    return { action: "create", title };
  const { issue, posted } = match;
  const reused = { number: issue.number, title: issue.title };
  if (posted.size) {
    const changed = current2.filter(([build, facts2]) => posted.get(build) !== facts2).map(([build]) => build);
    if (!changed.length)
      return { action: "none", ...reused, reason: `issue #${issue.number} already holds these findings` };
    return { action: "comment", ...reused, builds: changed };
  }
  const latest = [issue.body ?? "", ...(issue.comments ?? []).map((comment) => comment.body ?? "")].flatMap((text) => [...text.matchAll(digestMarker)].map((found) => found[1])).at(-1);
  if (latest === digest)
    return { action: "none", ...reused, reason: `issue #${issue.number} already holds this report` };
  return { action: "comment", ...reused };
}
var code = (text) => `\`${String(text).replaceAll("`", "'")}\``;
var cell = (text) => String(text).replaceAll("|", "\\|").replaceAll(`
`, " ");
var verdictText = (item) => !item ? "-" : item.verdict === "accepted" ? "accepted" : `**${item.verdict}**`;
var steps = {
  canonical: "Canonical digest not verified: read the glue diff in the new manifest and " + "check the bootstrap/result protocol (`userscript/src/native/worker-contract.js`). Unchanged protocol: add a `verifiedCanonical` row " + "with evidence; changed protocol: fix `worker-contract.js` (docs/WORKER-BEHAVIOUR-GATE.md, «Что остаётся сопровождающему»).",
  "core-worker-missing": "No core Worker in the page: check the Worker URLs in the archived `page.html`; " + "a renamed Worker must still pass L0 (`workerHostOf`, docs/WORKER-BEHAVIOUR-GATE.md).",
  discovery: "Discovery failed: compare the old and new `core.js`/`ritzmain.js` bodies " + "(`node tools/native-build/discover-offline.mjs research/archive/native-build-<date>`; README step 3).",
  "discovery-reader-fields": "Reader fields missing: `readerFields` in `userscript/src/native/discovery.js` matched no or several " + "functions for the field (`missingReaderFields` in the discover-offline report); fit its pattern to the new `ritzmain.js` body (README step 3).",
  relations: "«Связи» failed: `bun tools/native-build/relations-offline.mjs research/archive/native-build-<date>`; " + "add a reference variant or a `calls` rule (README step 3).",
  "grid-fields": "Grid fields unresolved: the cell counter cannot read sheet sizes; check `gridFields` in " + "`userscript/src/native/relation-bindings.js` against the new `Qt`/`aYf` bodies."
};
function renderMarkdown(report) {
  const lines = [];
  const heading = report.status === "error" ? "Google Sheets watch failed" : report.status === "attention" ? "Google Sheets build needs attention" : "Google Sheets watch: nothing needs a human";
  lines.push(`## ${heading}`, "");
  const served = (report.builds ?? []).map((build) => `${code(build.build)} ×${build.seen}`).join(", ") || "none";
  lines.push(`Checked ${report.checkedAt} · public sheet ${code(report.sheet)} · ${report.samples?.usable ?? 0} of ${report.samples?.requested ?? 0} samples usable · builds served: ${served}`, "");
  if (report.error)
    lines.push(`**Error:** ${cell(report.error)}`, "", "Exit 2: the watch itself or the network failed; no issue is opened for this.", "");
  for (const build of report.builds ?? []) {
    const host = build.coreHost;
    lines.push(`### Build ${code(build.build)} — ${build.attention.length ? "attention" : "ok"}`, "");
    lines.push(`Bundle ${code(build.bundleKey)}, locale ${code(build.locale)}, fecwwcd=${build.customDescriptorsFlag ?? "absent"}, ${build.known ? `archived ${build.known}` : "not archived"}.`, "");
    lines.push("| Check | Verdict |", "| --- | --- |");
    lines.push(`| Core Worker host | ${host ? `${code(host.host)}${host.knownHost ? "" : " (new name)"}` : "**missing**"} |`);
    if (host) {
      lines.push(`| Canonical digest (CV6) | ${verdictText(host.canonical)}${host.canonical.sha256 ? ` ${code(short(host.canonical.sha256))}` : ""} |`);
      lines.push(`| Anchors / glue digests | ${verdictText(host.anchors)} / ${verdictText(host.glue)} |`);
    }
    const fields = build.discovery.missingReaderFields ?? [], roles2 = build.discovery.missingOptionalRoles ?? [];
    lines.push(`| Offline discovery | ${build.discovery.status === "ok" ? "ok" : `**${build.discovery.status}**`}${build.discovery.failure ? ` — ${cell(build.discovery.failure)}` : ""}` + `${fields.length ? `; **no reader field** ${fields.map(code).join(", ")}` : ""}${roles2.length ? `; no optional role ${roles2.map(code).join(", ")}` : ""} |`);
    lines.push(`| Offline «Связи» | ${build.relations.status === "ok" ? "ok" : "**failed**"} (${build.relations.rolesAligned ?? "?"}/${build.relations.rolesTotal ?? "?"} roles) |`);
    lines.push(`| Grid fields | ${build.gridFields.status === "ok" ? "" : "**unresolved** "}chunk ${code(build.gridFields.chunk ?? "?")}, rows ${code(build.gridFields.rows ?? "?")}, columns ${code(build.gridFields.columns ?? "?")} |`, "");
    if (build.attention.length)
      lines.push("Needs a human:", ...build.attention.map((item) => `- ${cell(item.message)}`), "");
    if (build.info.length)
      lines.push("Informational:", ...build.info.map((item) => `- ${cell(item.message)}`), "");
  }
  const codes = new Set((report.builds ?? []).flatMap((build) => build.attention.map((item) => item.code)));
  if (codes.size) {
    lines.push("### What to do", "", "1. In SheetsScope run `bun run native:update`: it archives the build and repeats these verdicts with the glue diff and engine counters " + "(`userscript/src/native/README.md`, «Когда Google выпустил новую сборку»).");
    let n = 2;
    for (const [key, text] of Object.entries(steps))
      if (codes.has(key))
        lines.push(`${n++}. ${text}`);
    lines.push(`${n++}. Release a new userscript version only for a real change (protocol or page code).`);
    lines.push(`${n}. Republish the watch so it carries the fix (\`bun run publish:watch --dry-run\`, then \`--yes\`): it runs the copies of ` + "`workers.js`, `discovery.js` and `relation-bindings.js` bundled when it was published, and a userscript release does not update them. " + "Close this issue after the republished watch passes; closed earlier, the next run opens it again.", "");
  }
  lines.push("<sub>tools/watch/check.mjs · exit 0 = nothing needs a human, 1 = attention, 2 = watch or network error.</sub>");
  if (report.issue) {
    lines.push("", `<!-- google-watch digest: ${report.issue.digest} -->`);
    for (const [build, facts2] of Object.entries(report.issue.builds ?? {}))
      lines.push(`<!-- google-watch build: ${encodeURIComponent(build)} ${facts2} -->`);
  }
  return lines.join(`
`) + `
`;
}

// tools/watch/check.mjs
var usage = "usage: check.mjs [--samples N] [--sheet <id>] [--json <file>] [--markdown <file>] | --plan-issue <issues.json> --report <report.json>";
var args = process.argv.slice(2);
var valued = new Set(["--samples", "--sheet", "--json", "--markdown", "--plan-issue", "--report"]);
for (let i = 0;i < args.length; i++) {
  if (!valued.has(args[i]) || args[i + 1] === undefined) {
    console.error(usage);
    process.exit(2);
  }
  i++;
}
var option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
if (args.includes("--plan-issue")) {
  try {
    const report = JSON.parse(readFileSync3(option("--report", "report.json"), "utf8"));
    const issues = JSON.parse(readFileSync3(option("--plan-issue"), "utf8"));
    console.log(JSON.stringify(planIssue(report, Array.isArray(issues) ? issues : [])));
    process.exit(0);
  } catch (error) {
    console.error(`plan-issue: ${error.message}`);
    process.exit(2);
  }
}
var samples = Number(option("--samples", 4));
var sheet = option("--sheet", defaultSheet);
var jsonPath = option("--json");
var markdownPath = option("--markdown");
if (!Number.isInteger(samples) || samples < 1 || samples > 20 || !/^[\w-]+$/.test(sheet)) {
  console.error(usage);
  process.exit(2);
}
var log = (...parts) => console.log(...parts);
var known = knownIndex(readKnownBuilds(), workers);
process.exitCode = 2;
var stray = [];
process.on("uncaughtException", (error) => {
  stray.push(String(error?.message ?? error).slice(0, 200));
});
process.on("unhandledRejection", (error) => {
  stray.push(String(error?.message ?? error).slice(0, 200));
});
async function sample() {
  log(`Sampling ${origin}/spreadsheets/d/${sheet}/edit anonymously x${samples}`);
  const pages = new Map;
  let usable = 0;
  for (let i = 0;i < samples; i++) {
    const page = parsePage((await get(`/spreadsheets/d/${sheet}/edit`)).toString("utf8"));
    if (!usablePage(page)) {
      log(`  sample ${i + 1}: no usable core/ritzmain URLs`);
      continue;
    }
    usable++;
    const entry = pages.get(page.build) ?? { page, seen: 0 };
    entry.seen++;
    pages.set(page.build, entry);
  }
  return { pages, usable };
}
function coreHostOf(page) {
  const hosts = page.workers.map((entry) => ({ ...entry, ...classify(entry, false) }));
  return hosts.find((entry) => entry.variant === "core" && entry.role === "host") ?? hosts.find((entry) => entry.name.startsWith("calcworkerhost") && entry.variant !== "cd") ?? null;
}
async function checkBuild(build, { page, seen }, dir) {
  log(`
== Build ${build} (${page.bundleKey}, locale ${page.locale}, x${seen}) ==`);
  const host = coreHostOf(page);
  const plan = [["core.js", page.modules.get("core")], ["ritzmain.js", page.modules.get("ritzmain")], ...host ? [["host-core.js", host.path]] : []];
  mkdirSync(dir, { recursive: true });
  const files = Object.fromEntries(await Promise.all(plan.map(async ([name, path]) => {
    const data = await get(path);
    writeFileSync(join3(dir, name), data);
    log(`  ${name.padEnd(13)} ${String(data.length).padStart(8)} B  ${sha2562(data).slice(0, 8)}`);
    return [name, { path, bytes: data.length, sha256: sha2562(data), data }];
  })));
  let coreHost = null;
  if (host) {
    const data = files["host-core.js"].data, name = `/${host.number}-${host.path.split(/\/\d+-/).pop()}`;
    const safe = async (digest) => {
      try {
        return await digest();
      } catch (error) {
        return { verdict: `error:${error.message}` };
      }
    };
    const glueSha = glueDigest(data);
    coreHost = {
      host: name,
      url: host.path,
      bytes: data.length,
      sha256: files["host-core.js"].sha256,
      knownHost: known.hosts.has(name),
      glue: { verdict: verifiedGlue.some((row) => row.sha256 === glueSha) ? "accepted" : "changed", sha256: glueSha },
      anchors: await safe(() => anchorsVerdict(data)),
      canonical: await safe(() => canonicalVerdict(data))
    };
    log(`  worker ${name}: canonical ${coreHost.canonical.verdict}, anchors ${coreHost.anchors.verdict}, glue ${coreHost.glue.verdict}`);
  } else
    log("  no core calc Worker host in the page");
  let discoveryRun, relationsRun;
  try {
    discoveryRun = await discoverOffline(dir);
  } catch (error) {
    discoveryRun = { code: 2, report: { harness: { error: `discovery harness threw: ${error.message}` } } };
  }
  try {
    relationsRun = relationsOffline(dir);
  } catch (error) {
    relationsRun = { failed: true, report: { unresolved: [], real: { forwardError: `relations harness threw: ${error.message}` } } };
  }
  const discovery = summarizeDiscovery(discoveryRun);
  const { relations, gridFields } = summarizeRelations(relationsRun);
  log(`  discovery ${discovery.status}${discovery.failure ? ` (${discovery.failure})` : ""}; relations ${relations.status}; grid fields ${gridFields.status}`);
  const result = {
    build,
    bundleKey: page.bundleKey,
    locale: page.locale,
    seen,
    known: known.builds.get(build) ?? null,
    customDescriptorsFlag: page.customDescriptorsFlag,
    workersOffered: page.workers.map((entry) => `/${entry.number}-${entry.name}.js`),
    files: Object.fromEntries(Object.entries(files).map(([name, { path, bytes, sha256: hash2 }]) => [name, { url: path, bytes, sha256: hash2 }])),
    coreHost,
    discovery,
    relations,
    gridFields,
    proofs: { discovery: discoveryRun.report, relations: relationsRun.report }
  };
  return { ...result, ...assessBuild(result, known) };
}
function write(report) {
  if (jsonPath)
    writeFileSync(jsonPath, JSON.stringify(report, null, 1) + `
`);
  if (markdownPath)
    writeFileSync(markdownPath, renderMarkdown(report));
}
var report = {
  tool: "google-watch",
  schema: 1,
  checkedAt: new Date().toISOString(),
  sheet,
  samples: { requested: samples, usable: 0 },
  status: "error",
  exitCode: 2,
  builds: [],
  issue: null,
  error: null,
  strayErrors: stray
};
var temp = null;
try {
  const { pages, usable } = await sample();
  report.samples.usable = usable;
  if (!pages.size)
    throw Error("no sample had usable core/ritzmain module URLs: the page layout changed (google-page.mjs parsePage)");
  log(`Builds served: ${[...pages].map(([build, { page, seen }]) => `${build} (${page.bundleKey}, x${seen}, fecwwcd=${page.customDescriptorsFlag})`).join("; ")}`);
  temp = mkdtempSync(join3(tmpdir(), "google-watch-"));
  let index = 0;
  for (const [build, entry] of pages)
    report.builds.push(await checkBuild(build, entry, join3(temp, /^[\w-]+$/.test(build) ? build : `build-${index++}`)));
  report.issue = issueFor(report.builds);
  report.status = report.issue ? "attention" : "ok";
  report.exitCode = report.issue ? 1 : 0;
} catch (error) {
  report.error = String(error?.message ?? error);
  console.error(`watch error: ${report.error}`);
} finally {
  if (temp)
    rmSync(temp, { recursive: true, force: true });
}
try {
  write(report);
  log(`
${report.status === "attention" ? `ATTENTION: ${report.issue.title}` : report.status === "ok" ? "OK: nothing needs a human" : "ERROR: see above"}`);
  for (const build of report.builds)
    for (const item of [...build.attention.map((a) => ["!", a]), ...build.info.map((i) => ["i", i])])
      log(`  ${item[0]} [${build.build}] ${item[1].message}`);
  if (stray.length)
    log(`  (${stray.length} stray error(s) from the loaded Google code were ignored)`);
} catch (error) {
  console.error(`watch error: the report could not be written (${String(error?.message ?? error)}); status was ${report.status}`);
  process.exit(2);
}
process.exit(report.exitCode);
