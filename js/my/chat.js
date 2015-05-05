/**
 * 基于Strophe.js 二次封装的会话对象
 *
 */
var Chat = function() {

    // 请求服务器数据的 URL
    var urls = {
        // 聊天记录
        chatlogs: '/plugins/chatlogs'
    }

    // 默认设置
    var defaultSettings = {
        // BOSH 地址,  注意: 末尾的斜杠必须要有
        bosh: '',
        // domain, Openfire 服务器配置项
        domain: 'example.com',
        // 用户名
        uname: '',
        // 密码
        upwd: '',
        // 服务器默认端口号
        port: '9090',
        // 每页的聊天记录数
        page_size: 15,
        // 当前显示的聊天记录页码
        curr_page_num: 1,
        // 是否开启调试
        debug: false,
        // 聊天对象的用户名
        f_name: 'friend_name',
        /** 
         * 消息发送后 de 回调操作
         * @param o {msg: '消息内容'}
         */
        after_send: function(o) {},
        /** 
         * 接受新消息后 de 回调操作
         * @param o {msg: '消息内容'}
         */
        receive: function(o) {},
        /** 
         * 加载聊天记录 de 回调操作
         * @param o {msg: '消息内容'}
         */
        load_chatlogs_success: function(o) {},
        /** 
         * 加载失败
         */
        load_error: function() {},
        /**
         * 登录成功
         */
        on_connected: function() {},
        /**
         * 登录中
         */
        on_connecting: function() {},
        /**
         * 用户连接被断开, 如用户在其他地方登录
         */
        on_disconnected: function() {},
        /**
         * 登录失败
         */
        on_connect_fail: function() {},
        /**
         * 自定义日志记录器
         */
        log: function(o) {},
    }

    // 最终的设置项
    var settings = {}

    /**
     * 初始化聊天服务器配置
     */
    var initialize = function(user_setttings) {
        $.extend(settings, defaultSettings, user_setttings)

        if (settings.debug) {
            Strophe.log = function(level, msg) {
                if (level == Strophe.LogLevel.DEBUG) {
                    console.debug(msg)
                } else if (level == Strophe.LogLevel.INFO) {
                    console.info(msg)
                } else if (level == Strophe.LogLevel.WARN) {
                    console.warn(msg)
                } else if (level == Strophe.LogLevel.ERROR || level == Strophe.LogLevel.FATAL) {
                    console.error(msg)
                } else {
                    console.log(msg)
                }

                logger.debug(msg)
            }
        }
    }

    /**
     * 连接聊天服务器
     */
    var connect = function() {
        var bosh = ''
        if (settings.bosh) {
            bosh = settings.bosh
        } else {
            bosh = 'http://' + settings.domain + ':7070/http-bind/'
        }

        // 连接 BOSH 服务器
        _conn = new Strophe.Connection(bosh)

        _conn.rawInput = function(data) {
            logger.debug(data)
        }
        _conn.rawOutput = function(data) {
            logger.debug(data)
        }

        // 用户登录 & 登录后的回调函数
        _conn.connect(_jid(settings.uname), settings.upwd, function(status) {
            _onConnect(status)
        }, 30)
    }

    /**
     * 发送消息
     *
     * @param to 接收者
     * @param msg 消息内容
     */
    var send = function(to, msg) {
        // 创建一个<message>元素并发送
        var xmpp_msg = $msg({
            to: _bare_id(to),
            from: _jid(settings.uname),
            type: 'chat'
        }).c("body", null, msg)

        _conn.send(xmpp_msg.tree())
        _conn.send($pres().tree())

        settings.after_send({
            msg: msg
        });
    }

    /**
     * 离线
     */
    var offline = function() {
        _conn.send($pres({
            type: "unavailable"
        }))
    }

    /**
     * 加载聊天记录
     *
     * @param receiver 消息接收者
     */
    var load_chatlogs = function(receiver) {
        $.ajax({
            url: _url(urls.chatlogs),
            async: false,
            data: {
                type: 'json',
                sender: settings.uname,
                receiver: receiver,
                pageNum: settings.curr_page_num++,
                pageSize: settings.page_size
            },
            dataType: 'jsonp',
            jsonp: "callback", //传递给请求处理程序或页面的，用以获得jsonp回调函数名的参数名(默认为:callback)  
            jsonpCallback: "foo", //自定义的jsonp回调函数名称，默认为jQuery自动生成的随机函数名  
            success: settings.load_chatlogs_success,
            error: settings.load_error
        })
    }

    // 连接成功后 de 回调函数
    var _onConnect = function(status) {

        logger.debug('>>> STATUS: ' + status)

        if (status == Strophe.Status.CONNECTING) {
            settings.on_connecting();
        } else if (status == Strophe.Status.CONNECTED) {
            settings.on_connected();

            _conn.addHandler(_onMessage, null, 'message')

            // 要发送一个<presence>给服务器（initial presence）
            _conn.send($pres({}))
        } else if (status == Strophe.Status.DISCONNECTING ||
            status == Strophe.Status.DISCONNECTED) {
            settings.on_disconnected()
        } else if (status == Strophe.Status.AUTHFAIL) {
            logger.debug("登录失败！")
            settings.on_connect_fail()
        } else if (status == Strophe.Status.CONNFAIL) {
            logger.debug("连接失败!");
            settings.on_connect_fail()
        }
    }

    // 定义接收到<message> XML Stanza时的Handler
    var _onMessage = function(stanza) {
        // 消息发送人
        var msg_from = stanza.getAttribute('from')
            // 消息类型, 如: chat - 聊天
        var msg_type = stanza.getAttribute('type')
            // 消息内容
        var msg_elems = stanza.getElementsByTagName('body')
        if (msg_type == "chat" && msg_elems.length > 0) {
            var msg_body = msg_elems[0]
            var reply_content = Strophe.getText(msg_body)

            settings.receive({
                msg: reply_content
            })
        }
        // 返回 true , 表明此Handler 的生命周期由本次Session决定 返回false, 表明只执行一次.
        return true
    }

    var get = function(key) {
        return settings[key]
    }

    var logger = {}

    logger.debug = function(msg) {
        if (settings.debug) {
            settings.log(msg)
        }
    }

    /**
     * 生成服务器插件地址
     */
    var _url = function(url) {
        return 'http://' + settings.domain + ':' + settings.port + url;
    }

    /**
     * JID 账号: 格式 [用户名@服务器域名/当前客户端环境(自定义)]
     */
    var _jid = function(uname) {
        return _bare_id(uname) + '/WebWechat'
    }

    /**
     * Bare 账号: 格式 [用户名@服务器域名]
     */
    var _bare_id = function(uname) {
        return uname + '@' + settings.domain
    }

    return {
        initialize: initialize,
        connect: connect,
        get: get,
        load_chatlogs: load_chatlogs,
        send: send
    }
}