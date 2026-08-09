(function() {

	function thumbnails(url) {
		return new Thumbnails([new Thumbnail(url, 0)]);
	}
	function audio_source_descriptor({ name, url, language = "Unknown", duration = 0, container = "audio/mpeg", codec = "mp3", bitrate = 0 }) {
		return audio_sources_descriptor([{
			name,
			url,
			language,
			duration,
			container,
			codec,
			bitrate
		}]);
	}
	function audio_sources_descriptor(sources) {
		return new UnMuxVideoSourceDescriptor([], sources.map(({ name, url, language = "Unknown", duration = 0, container = "audio/mpeg", codec = "mp3", bitrate = 0 }) => new AudioUrlSource({
			name,
			bitrate,
			container,
			codec,
			duration,
			url,
			language
		})));
	}

	function plugin_asset(config, path) {
		const url = String(path ?? "");
		if (/^https?:\/\//.test(url)) return url;
		const base = String(config?.sourceUrl ?? "").replace(/\/[^/]*$/, "/");
		return base ? `${base}${url.replace(/^\.\//, "")}` : url;
	}
	function plugin_icon_url(config, default_icon) {
		return config?.absoluteIconUrl ?? plugin_asset(config, config?.iconUrl ?? default_icon);
	}
	function static_thumbnails(config, default_icon) {
		return thumbnails(plugin_icon_url(config, default_icon));
	}

	function dedupe_by(items, key) {
		const seen = {};
		const result = [];
		for (const item of items) {
			const value = key(item);
			if (!value || seen[value]) continue;
			seen[value] = true;
			result.push(item);
		}
		return result;
	}
	function dedupe_by_url(items) {
		return dedupe_by(items, (item) => item.url ?? item.contentUrl);
	}

	function selected_filter_values(filters, id) {
		if (!filters) return [];
		if (Array.isArray(filters)) return filters.filter((filter) => filter?.id === id || filter?.group?.id === id).map(filter_value).filter(Boolean);
		let value = filters[id];
		if (value === void 0 && typeof filters.get === "function") value = filters.get(id);
		if (value === void 0 || value === null) return [];
		return (Array.isArray(value) ? value : [value]).map(filter_value).filter(Boolean);
	}
	function filter_value(value) {
		return String(value?.value ?? value?.id ?? value ?? "");
	}

	function grayjay_platform(platform, get_config_id) {
		const platform_id = (id) => new PlatformID(platform, String(id), get_config_id());
		return {
			id: platform_id,
			author(id, name, url, thumbnail) {
				return new PlatformAuthorLink(platform_id(id), name, url, thumbnail);
			},
			feed_video(id, value) {
				return new PlatformVideo({
					id: platform_id(id),
					...value
				});
			},
			video(id, value) {
				return new PlatformVideoDetails({
					id: platform_id(id),
					...value
				});
			},
			nested(id, value) {
				return new PlatformNestedMediaContent({
					id: platform_id(id),
					...value
				});
			},
			web(id, value) {
				return new PlatformWebDetails({
					id: platform_id(id),
					...value
				});
			},
			channel(id, value) {
				return new PlatformChannel({
					id: platform_id(id),
					subscribers: 0,
					...value
				});
			},
			playlist(id, value) {
				return new PlatformPlaylist({
					id: platform_id(id),
					...value
				});
			},
			playlist_details(id, value) {
				return new PlatformPlaylistDetails({
					id: platform_id(id),
					...value
				});
			}
		};
	}

	var REDACTED = "[redacted]";
	var SENSITIVE_KEY = /authorization|cookie|token|secret|password|signature/i;
	function is_testing() {
		return typeof IS_TESTING !== "undefined" && IS_TESTING;
	}
	function debug_string(value, maxLength = 1200) {
		if (value === void 0) return "";
		const seen = [];
		let text;
		try {
			if (typeof value === "string") text = value;
			else if (value && typeof value === "object" && typeof value.message === "string") text = value.stack || `${value.name || "Error"}: ${value.message}`;
			else text = JSON.stringify(value, (key, item) => {
				if (SENSITIVE_KEY.test(key)) return REDACTED;
				if (item && typeof item === "object") {
					if (seen.indexOf(item) >= 0) return "[circular]";
					seen.push(item);
				}
				return item;
			});
		} catch {
			text = String(value);
		}
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
	}
	function debug_log(scope, message, data) {
		if (!is_testing()) return;
		const text = `[${scope}] ${message}${data === void 0 ? "" : ` ${debug_string(data)}`}`;
		if (typeof log === "function") log(text);
	}

	var BODY_PREVIEW_LENGTH = 500;
	function get_response(url, headers = {}, useAuth = false, debugContext = null) {
		const response = request("GET", url, "", headers, useAuth, debugContext);
		if (!response.isOk) throw request_error(response, url);
		return response;
	}
	function get_text(url, headers = {}, useAuth = false, debugContext = null) {
		return get_response(url, headers, useAuth, debugContext).body;
	}
	function get_json(url, headers = {}, useAuth = false, debugContext = null) {
		const text = get_text(url, headers, useAuth, debugContext);
		try {
			return JSON.parse(text);
		} catch (e) {
			debug_log(debug_scope(debugContext), "JSON parse failed", {
				url,
				error: String(e),
				preview: debug_string(text, BODY_PREVIEW_LENGTH)
			});
			throw e;
		}
	}
	function query_string(params) {
		return params.filter((item) => item[1] !== null && item[1] !== void 0).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
	}
	function init_lru_caches(state, limits) {
		state.cacheOrder = state.cacheOrder ?? {};
		for (const cacheName of Object.keys(limits)) {
			state[cacheName] = state[cacheName] ?? {};
			if (!Array.isArray(state.cacheOrder[cacheName])) state.cacheOrder[cacheName] = Object.keys(state[cacheName]);
			prune_lru_cache(state, limits, cacheName);
		}
	}
	function cache_set(state, limits, cacheName, key, value) {
		if (!key) return value;
		state[cacheName] = state[cacheName] ?? {};
		state.cacheOrder = state.cacheOrder ?? {};
		state.cacheOrder[cacheName] = Array.isArray(state.cacheOrder[cacheName]) ? state.cacheOrder[cacheName] : Object.keys(state[cacheName]);
		const cacheKey = String(key);
		const order = state.cacheOrder[cacheName];
		const previousIndex = order.indexOf(cacheKey);
		if (previousIndex >= 0) order.splice(previousIndex, 1);
		state[cacheName][cacheKey] = value;
		order.push(cacheKey);
		prune_lru_cache(state, limits, cacheName);
		return value;
	}
	function cache_get(state, limits, cacheName, key) {
		const cacheKey = String(key);
		const value = state[cacheName]?.[cacheKey];
		if (value !== void 0) cache_set(state, limits, cacheName, cacheKey, value);
		return value;
	}
	function prune_lru_cache(state, limits, cacheName) {
		const limit = limits[cacheName];
		const order = state.cacheOrder?.[cacheName];
		if (!limit || !Array.isArray(order)) return;
		while (order.length > limit) {
			const key = order.shift();
			if (key) delete state[cacheName][key];
		}
	}
	function request(method, url, body, headers, useAuth, debugContext = null) {
		const start = Date.now();
		try {
			const response = method === "POST" ? http.POST(url, body, headers, useAuth) : http.GET(url, headers, useAuth);
			log_response(method, url, response, Date.now() - start, debugContext);
			return response;
		} catch (e) {
			debug_log(debug_scope(debugContext), "HTTP exception", {
				method,
				url,
				ms: Date.now() - start,
				error: String(e)
			});
			throw e;
		}
	}
	function log_response(method, url, response, ms, debugContext) {
		const details = {
			method,
			url,
			code: response?.code,
			ms,
			bytes: body_length(response)
		};
		if (response?.isOk) {
			debug_log(debug_scope(debugContext), "HTTP OK", details);
			return;
		}
		debug_log(debug_scope(debugContext), "HTTP failure", {
			...details,
			preview: body_preview(response)
		});
	}
	function request_error(response, url) {
		return new ScriptException(`Request failed with code ${response.code}: ${url}`);
	}
	function debug_scope(debugContext) {
		if (!debugContext) return "http";
		if (typeof debugContext === "string") return debugContext;
		return debugContext.scope || "http";
	}
	function body_length(response) {
		const body = response?.body;
		if (typeof body === "string") return body.length;
		return body?.length ?? body?.byteLength ?? 0;
	}
	function body_preview(response) {
		const body = response?.body;
		return typeof body === "string" ? debug_string(body, BODY_PREVIEW_LENGTH) : "";
	}

	function apply_pager_state(target, next) {
		target.results = next.results;
		target.hasMore = next.hasMore;
		target.context = next.context;
		return target;
	}
	function array_pager_class(BasePager) {
		return class ArrayPager extends BasePager {
			constructor(items, limit, offset = 0) {
				const results = items.slice(offset, offset + limit);
				super(results, offset + limit < items.length, {
					items,
					limit,
					offset: offset + limit
				});
			}
			nextPage() {
				return apply_pager_state(this, new this.constructor(this.context.items, this.context.limit, this.context.offset));
			}
		};
	}

	function decode_html(value) {
		return String(value ?? "").replace(/&#0*39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
	}
	function clean_text(value) {
		return decode_html(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
	}
	function normalize_text(value) {
		return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
	}
	function normalize_search_text(value) {
		return normalize_text(value).replace(/[\u064b-\u065f\u0670]/g, "").replace(/[إأآٱا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ـ/g, "").replace(/[^\w\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
	}

	var PLATFORM = "AlFiqh";
	var BASE_URL = "https://alfiqh.net";
	var API_URL = `${BASE_URL}/wp-json/wp/v2`;
	var DEFAULT_ICON = `${BASE_URL}/wp-content/uploads/2020/04/cropped-alfiqh.net_-1.jpg`;
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { jsonCache: 160 };
	Type.Order.Chronological_Reverse = "Chronological Reverse";
	var _config = {};
	var _state = {};
	var grayjay = grayjay_platform(PLATFORM, () => _config.id);
	source.enable = function(conf, _settings, savedState) {
		_config = conf ?? {};
		_state = parseState(savedState);
		init_lru_caches(_state, CACHE_LIMITS);
	};
	source.saveState = function() {
		return "{}";
	};
	source.getHome = function() {
		return new AlFiqhPostPager(1);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological, Type.Order.Chronological_Reverse],
		filters: [speakerFilter(), topicFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [...categories().slice(0, 6).map((item) => item.name), ...tags().slice(0, 6).map((item) => item.name)];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, order, filters) {
		return new AlFiqhPostPager(1, {
			search: query,
			category: selectedSpeaker(filters),
			tag: selectedTopic(filters),
			order: order === Type.Order.Chronological_Reverse ? "asc" : "desc"
		});
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "root" || parsed?.type === "category" || parsed?.type === "tag" || normalized === BASE_URL || Boolean(categoryFromPublicUrl(normalized)) || Boolean(tagFromPublicUrl(normalized));
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return categoryChannel(categoryById(parsed.id));
		if (parsed?.type === "tag") return tagChannel(tagById(parsed.id));
		const category = categoryFromPublicUrl(normalizePublicUrl(url));
		if (category) return categoryChannel(category);
		const tag = tagFromPublicUrl(normalizePublicUrl(url));
		if (tag) return tagChannel(tag);
		return grayjay.channel("root", {
			name: "موقع الفقه في الدين",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "دروس علمية وفتاوى شرعية لطلبة العلم.",
			url: "alfiqh://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return new AlFiqhPostPager(1, { category: parsed.id });
		if (parsed?.type === "tag") return new AlFiqhPostPager(1, { tag: parsed.id });
		return source.getHome();
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, _type, order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return new AlFiqhPostPager(1, {
			search: query,
			category: parsed.id,
			order: order === Type.Order.Chronological_Reverse ? "asc" : "desc"
		});
		if (parsed?.type === "tag") return new AlFiqhPostPager(1, {
			search: query,
			tag: parsed.id,
			order: order === Type.Order.Chronological_Reverse ? "asc" : "desc"
		});
		return source.search(query, null, order, null);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([
			source.getChannel("alfiqh://root"),
			...categories().map(categoryChannel),
			...tags().slice(0, 24).map(tagChannel)
		].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "playlist" || isPublicPostUrl(normalized);
	};
	source.searchPlaylists = function(query, _type, order, filters) {
		return new AlFiqhPlaylistPager(1, {
			search: query,
			category: selectedSpeaker(filters),
			tag: selectedTopic(filters),
			order: order === Type.Order.Chronological_Reverse ? "asc" : "desc"
		});
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		return postToPlaylistDetails(parsed?.type === "playlist" ? fetchPost(parsed.id) : fetchPostBySlug(slugFromPublicUrl(normalizePublicUrl(url))));
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return new AlFiqhPlaylistPager(1, { category: parsed.id });
		if (parsed?.type === "tag") return new AlFiqhPlaylistPager(1, { tag: parsed.id });
		return new AlFiqhPlaylistPager(1);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "track" || /^https:\/\/archive\.org\/download\/.*\.mp3(?:$|\?)/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "track") return trackToDetails(fetchPost(parsed.postId), Number(parsed.index));
		const normalized = normalizePublicUrl(url);
		if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized);
		throw new ScriptException(`Unsupported ${PLATFORM} content URL`);
	};
	function parseState(value) {
		try {
			return JSON.parse(value || "{}");
		} catch (_e) {
			return {};
		}
	}
	function fetchJson(url) {
		const cached = cache_get(_state, CACHE_LIMITS, "jsonCache", url);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "jsonCache", url, get_json(url, { Accept: "application/json" }));
	}
	function fetchPosts(page = 1, options = {}) {
		return fetchJson(`${API_URL}/posts?${query_string([
			["per_page", DEFAULT_LIMIT],
			["page", page],
			["_embed", 1],
			["search", options.search || null],
			["categories", options.category || null],
			["tags", options.tag || null],
			["orderby", "date"],
			["order", options.order || "desc"]
		])}`);
	}
	function fetchPost(id) {
		return fetchJson(`${API_URL}/posts/${id}`);
	}
	function fetchPostBySlug(slug) {
		const posts = fetchJson(`${API_URL}/posts?${query_string([["slug", slug], ["per_page", 1]])}`);
		if (!posts?.[0]) throw new ScriptException(`${PLATFORM} post not found`);
		return posts[0];
	}
	function categories() {
		return fetchJson(`${API_URL}/categories?per_page=100&orderby=count&order=desc`);
	}
	function tags() {
		return fetchJson(`${API_URL}/tags?per_page=100&orderby=count&order=desc`);
	}
	function postToFirstTrack(post) {
		const tracks = tracksFromPost(post);
		return tracks[0] ? trackToFeed(post, tracks[0], 0) : null;
	}
	function postToPlaylist(post) {
		return grayjay.playlist(`post-${post.id}`, {
			name: postTitle(post),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: authorForPost(post),
			datetime: parseDate(post.date),
			url: playlistUrl(post.id),
			videoCount: tracksFromPost(post).length
		});
	}
	function postToPlaylistDetails(post) {
		const tracks = tracksFromPost(post);
		return grayjay.playlist_details(`post-${post.id}`, {
			name: postTitle(post),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: authorForPost(post),
			datetime: parseDate(post.date),
			url: playlistUrl(post.id),
			videoCount: tracks.length,
			contents: new ArrayVideoPager(tracks.map((track, index) => trackToFeed(post, track, index)), DEFAULT_LIMIT)
		});
	}
	function trackToFeed(post, track, index) {
		return grayjay.feed_video(`track-${post.id}-${index}`, {
			name: track.title || postTitle(post),
			thumbnails: staticThumbnails(),
			author: authorForPost(post),
			uploadDate: parseDate(post.date),
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: trackUrl(post.id, index),
			description: postTitle(post),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: track.url,
				language: "ar"
			}),
			shareUrl: normalizePublicUrl(post.link)
		});
	}
	function trackToDetails(post, index) {
		const tracks = tracksFromPost(post);
		const track = tracks[index];
		if (!track) throw new ScriptException(`${PLATFORM} track not found`);
		return grayjay.video(`track-${post.id}-${index}`, {
			name: track.title || postTitle(post),
			thumbnails: staticThumbnails(),
			author: authorForPost(post),
			uploadDate: parseDate(post.date),
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: trackUrl(post.id, index),
			description: clean_text(post.content?.rendered || postTitle(post)).slice(0, 2e3),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: track.url,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: normalizePublicUrl(post.link),
			getContentRecommendations: () => new ArrayVideoPager(tracks.map((item, itemIndex) => trackToFeed(post, item, itemIndex)).filter((_, itemIndex) => itemIndex !== index), DEFAULT_LIMIT)
		});
	}
	function directMp3ToDetails(url) {
		return grayjay.video(`mp3-${normalize_search_text(url).slice(-64)}`, {
			name: decodeTitle(url),
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url,
			description: PLATFORM,
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: url
		});
	}
	function tracksFromPost(post) {
		const tracks = [];
		const html = decode_html(post.content?.rendered || "");
		const regex = /<a\b[^>]*href=["']([^"']+\.mp3(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) tracks.push({
			url: encodeUrl(match[1]),
			title: clean_text(match[2])
		});
		return dedupe_by_url(tracks);
	}
	function postTitle(post) {
		return clean_text(post?.title?.rendered || post?.title || PLATFORM);
	}
	function authorForPost(post) {
		const category = categoryById(post.categories?.[0]);
		return category ? grayjay.author(`category-${category.id}`, category.name, category.link || BASE_URL, iconUrl()) : rootAuthor();
	}
	function rootAuthor() {
		return grayjay.author("alfiqh", "موقع الفقه في الدين", BASE_URL, iconUrl());
	}
	function categoryChannel(category) {
		return grayjay.channel(`category-${category.id}`, {
			name: category.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${category.name} - ${category.count} سلسلة`,
			url: categoryUrl(category.id),
			urlAlternatives: [normalizePublicUrl(category.link)]
		});
	}
	function tagChannel(tag) {
		return grayjay.channel(`tag-${tag.id}`, {
			name: tag.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${tag.name} - ${tag.count} سلسلة`,
			url: tagUrl(tag.id),
			urlAlternatives: [normalizePublicUrl(tag.link)]
		});
	}
	function speakerFilter() {
		return {
			id: "speaker",
			name: "الشيخ",
			isMultiSelect: false,
			filters: [{
				id: "all",
				name: "كل الشيوخ",
				value: "all"
			}, ...categories().slice(0, 60).map((category) => ({
				id: String(category.id),
				name: category.name,
				value: String(category.id)
			}))]
		};
	}
	function topicFilter() {
		return {
			id: "topic",
			name: "الموضوع",
			isMultiSelect: false,
			filters: [{
				id: "all",
				name: "كل المواضيع",
				value: "all"
			}, ...tags().slice(0, 60).map((tag) => ({
				id: String(tag.id),
				name: tag.name,
				value: String(tag.id)
			}))]
		};
	}
	function selectedSpeaker(filters) {
		const value = selected_filter_values(filters, "speaker")[0];
		return value && value !== "all" ? value : null;
	}
	function selectedTopic(filters) {
		const value = selected_filter_values(filters, "topic")[0];
		return value && value !== "all" ? value : null;
	}
	function categoryById(id) {
		return categories().find((category) => String(category.id) === String(id));
	}
	function tagById(id) {
		return tags().find((tag) => String(tag.id) === String(id));
	}
	function categoryFromPublicUrl(url) {
		return categories().find((category) => normalizePublicUrl(category.link) === url);
	}
	function tagFromPublicUrl(url) {
		return tags().find((tag) => normalizePublicUrl(tag.link) === url);
	}
	function normalizePublicUrl(url) {
		return decode_html(String(url ?? "").trim()).replace(/^http:\/\//i, "https://").replace(/^https:\/\/www\.alfiqh\.net/i, BASE_URL);
	}
	function encodeUrl(url) {
		try {
			return encodeURI(decodeURI(url));
		} catch (_e) {
			return encodeURI(url);
		}
	}
	function parseDate(value) {
		const raw = String(value ?? "");
		return raw ? Math.floor((/* @__PURE__ */ new Date(`${raw.endsWith("Z") ? raw : `${raw}Z`}`)).getTime() / 1e3) || 0 : 0;
	}
	function decodeTitle(url) {
		return decodeURIComponent(String(url ?? "").split("/").pop()?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, "") || PLATFORM).replace(/[-_]+/g, " ");
	}
	function isPublicPostUrl(url) {
		return /^https:\/\/alfiqh\.net\/[^/?#]+\/?$/i.test(url) && !url.includes("/category/") && !url.includes("/tag/");
	}
	function slugFromPublicUrl(url) {
		return String(url ?? "").replace(/^https:\/\/alfiqh\.net\//i, "").replace(/\/.*$/, "");
	}
	function categoryUrl(id) {
		return `alfiqh://category/${id}`;
	}
	function tagUrl(id) {
		return `alfiqh://tag/${id}`;
	}
	function playlistUrl(id) {
		return `alfiqh://playlist/post/${id}`;
	}
	function trackUrl(postId, index) {
		return `alfiqh://track/${postId}/${index}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "alfiqh://root") return { type: "root" };
		let match = value.match(/^alfiqh:\/\/category\/(\d+)$/);
		if (match) return {
			type: "category",
			id: match[1]
		};
		match = value.match(/^alfiqh:\/\/tag\/(\d+)$/);
		if (match) return {
			type: "tag",
			id: match[1]
		};
		match = value.match(/^alfiqh:\/\/playlist\/post\/(\d+)$/);
		if (match) return {
			type: "playlist",
			id: match[1]
		};
		match = value.match(/^alfiqh:\/\/track\/(\d+)\/(\d+)$/);
		if (match) return {
			type: "track",
			postId: match[1],
			index: match[2]
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	var AlFiqhPostPager = class AlFiqhPostPager extends VideoPager {
		constructor(page = 1, options = {}) {
			const posts = fetchPosts(page, options);
			super(posts.map(postToFirstTrack).filter(Boolean), posts.length === DEFAULT_LIMIT, {
				page,
				options
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlFiqhPostPager(this.context.page + 1, this.context.options));
		}
	};
	var AlFiqhPlaylistPager = class AlFiqhPlaylistPager extends PlaylistPager {
		constructor(page = 1, options = {}) {
			const posts = fetchPosts(page, options).filter((post) => tracksFromPost(post).length);
			super(posts.map(postToPlaylist), posts.length === DEFAULT_LIMIT, {
				page,
				options
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlFiqhPlaylistPager(this.context.page + 1, this.context.options));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	log("LOADED AlFiqh " + staticThumbnails().sources.length);

})();
